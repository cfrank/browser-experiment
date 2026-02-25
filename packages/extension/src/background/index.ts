declare const __DEV__: boolean;
declare const __EXT_VERSION__: string;
declare const __EXT_BUILD_HASH__: string;

import {
  type Message,
  type ExtensionHelloPayload,
  type ExtensionLogPayload,
  type StorageAssetsPayload,
  createMessage,
} from "@browser-experiment/shared";
import { OrchestratorClient } from "./ws-client.js";
import { setupCommandHandler } from "./commands.js";

if (__DEV__) {
  import("./dev-reload.js").then((m) => m.initDevReload());
}

const client = new OrchestratorClient();
setupCommandHandler(client);

function sendExtLog(
  level: ExtensionLogPayload["level"],
  category: string,
  message: string,
  data?: unknown,
): void {
  if (!client.isConnected) return;
  client.send(
    createMessage<ExtensionLogPayload>("extension.log", "system", {
      level,
      category,
      message,
      ...(data !== undefined && { data }),
    }),
  );
}

client.onConnect(() => {
  const payload: ExtensionHelloPayload = {
    manifestVersion: __EXT_VERSION__,
    buildHash: __EXT_BUILD_HASH__,
    userAgent: navigator.userAgent,
  };
  client.send(createMessage("extension.hello", "system", payload));
  console.log(
    `[background] sent hello v${__EXT_VERSION__} build=${__EXT_BUILD_HASH__}`,
  );
});

const SESSION_MESSAGE_TYPES = [
  "session.chunk",
  "session.done",
  "session.error",
  "session.toolUse",
  "session.toolResult",
];

for (const type of SESSION_MESSAGE_TYPES) {
  client.onMessage(type, (msg) => {
    chrome.runtime.sendMessage(msg).catch(() => {
      // side panel might not be open; ignore
    });
  });
}

client.onMessage("storage.assets", async (msg: Message) => {
  const payload = msg.payload as StorageAssetsPayload;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  for (const script of payload.scripts) {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (code: string) => {
        const el = document.createElement("script");
        el.textContent = code;
        document.documentElement.appendChild(el);
        el.remove();
      },
      args: [script.content],
      world: "MAIN",
    });
  }

  for (const style of payload.styles) {
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      css: style.content,
    });
  }
});

client.connect();

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab.url) return;

  try {
    const domain = new URL(tab.url).hostname;
    if (domain && client.isConnected) {
      client.send(
        createMessage("storage.getAssets", "system", { domain }),
      );
    }
  } catch {
    // ignore invalid URLs
  }
});

chrome.action.onClicked.addListener(() => {
  chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "orchestrator:send") {
    client.send(message.payload);
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === "orchestrator:status") {
    sendResponse({ connected: client.isConnected });
    return false;
  }

  return false;
});

console.log("[background] service worker started");
