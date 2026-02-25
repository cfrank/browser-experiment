import {
  type Message,
  type BrowserCommandPayload,
  type BrowserResultPayload,
  type ExtensionLogPayload,
  createMessage,
} from "@browser-experiment/shared";
import type { OrchestratorClient } from "./ws-client.js";

type CommandExecutor = (
  args: Record<string, unknown>,
) => Promise<unknown>;

async function getActiveTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (!tab?.id) throw new Error("No active tab");
  return tab;
}

const commandExecutors: Record<string, CommandExecutor> = {
  async screenshot() {
    const tab = await getActiveTab();
    const dataUrl = await chrome.tabs.captureVisibleTab(
      tab.windowId,
      { format: "jpeg", quality: 60 },
    );
    return dataUrl;
  },

  async get_url() {
    const tab = await getActiveTab();
    return tab.url ?? "";
  },

  async navigate(args) {
    const url = args.url as string;
    if (!url) throw new Error("navigate requires a url argument");
    const tab = await getActiveTab();
    await chrome.tabs.update(tab.id!, { url });
    return { navigated: url };
  },

  async open_tab(args) {
    const url = args.url as string;
    if (!url) throw new Error("open_tab requires a url argument");
    const active = (args.active as boolean) ?? true;
    const tab = await chrome.tabs.create({ url, active });
    return { tabId: tab.id, url, active };
  },

  async open_window(args) {
    const url = args.url as string;
    if (!url) throw new Error("open_window requires a url argument");
    const incognito = (args.incognito as boolean) ?? false;
    const win = await chrome.windows.create({ url, incognito, focused: true });
    return { windowId: win.id, url, incognito };
  },

  async inject_script(args) {
    const code = args.code as string;
    if (!code) throw new Error("inject_script requires a code argument");
    const timeout = (args.timeout_ms as number) ?? 30_000;
    const tab = await getActiveTab();
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id! },
      func: async (src: string, timeoutMs: number) => {
        const result = eval(src);
        if (result && typeof result === "object" && typeof result.then === "function") {
          return Promise.race([
            result,
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error(`async result timed out after ${timeoutMs}ms`)), timeoutMs),
            ),
          ]);
        }
        return result;
      },
      args: [code, timeout],
      world: "MAIN",
    });
    return results[0]?.result ?? null;
  },

  async inject_style(args) {
    const css = args.css as string;
    if (!css) throw new Error("inject_style requires a css argument");
    const tab = await getActiveTab();
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id! },
      css,
    });
    return { injected: true };
  },

  async read_dom(args) {
    const selector = args.selector as string;
    if (!selector) throw new Error("read_dom requires a selector argument");
    const tab = await getActiveTab();
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id! },
      func: (sel: string) => {
        const el = document.querySelector(sel);
        return el ? el.outerHTML : null;
      },
      args: [selector],
      world: "MAIN",
    });
    return results[0]?.result ?? null;
  },

  async wait_for(args) {
    const condition = args.condition as string;
    if (!condition) throw new Error("wait_for requires a condition argument");
    const timeoutMs = (args.timeout_ms as number) ?? 5_000;
    const pollMs = (args.poll_ms as number) ?? 200;
    const tab = await getActiveTab();
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id! },
      func: async (cond: string, timeout: number, poll: number) => {
        const start = Date.now();
        while (Date.now() - start < timeout) {
          try {
            const val = eval(cond);
            if (val) return { met: true, value: val, elapsed_ms: Date.now() - start };
          } catch { /* condition not met yet */ }
          await new Promise((r) => setTimeout(r, poll));
        }
        try {
          const val = eval(cond);
          if (val) return { met: true, value: val, elapsed_ms: Date.now() - start };
        } catch { /* final attempt failed */ }
        return { met: false, elapsed_ms: Date.now() - start };
      },
      args: [condition, timeoutMs, pollMs],
      world: "MAIN",
    });
    return results[0]?.result ?? null;
  },

  async console_logs() {
    const tab = await getActiveTab();
    try {
      return await chrome.tabs.sendMessage(tab.id!, { type: "get_console_logs" });
    } catch (err) {
      return handleContentScriptError(tab, err, "get_console_logs");
    }
  },

  async network_logs() {
    const tab = await getActiveTab();
    try {
      return await chrome.tabs.sendMessage(tab.id!, { type: "get_network_logs" });
    } catch (err) {
      return handleContentScriptError(tab, err, "get_network_logs");
    }
  },
};

async function handleContentScriptError(
  tab: chrome.tabs.Tab,
  err: unknown,
  messageType: string,
): Promise<unknown> {
  const msg = err instanceof Error ? err.message : String(err);
  if (!msg.includes("Receiving end does not exist") && !msg.includes("Could not establish connection")) {
    throw err;
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id! },
      files: ["content.js"],
    });
    const response = await chrome.tabs.sendMessage(tab.id!, { type: messageType });
    return {
      reinjected: true,
      entries: response,
      note: "Content script was reinjected (previous capture data was lost). New captures will work normally.",
    };
  } catch {
    throw new Error(
      "Content script is unavailable and could not be reinjected. " +
      "This can happen after full DOM replacement (e.g. document.documentElement.innerHTML = ...) " +
      "or extension reload. Try reloading the page to restore capture functionality.",
    );
  }
}

function extLog(
  client: OrchestratorClient,
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

export function setupCommandHandler(client: OrchestratorClient): void {
  client.onMessage("browser.command", async (msg: Message) => {
    const payload = msg.payload as BrowserCommandPayload;
    const executor = commandExecutors[payload.command];
    const startTime = Date.now();

    let result: BrowserResultPayload;

    if (!executor) {
      result = {
        commandId: msg.id,
        success: false,
        data: null,
        error: `Unknown command: ${payload.command}`,
      };
      extLog(client, "error", "command", `unknown command: ${payload.command}`);
    } else {
      try {
        const data = await executor(payload.args ?? {});
        result = {
          commandId: msg.id,
          success: true,
          data,
        };
        extLog(client, "debug", "command", `${payload.command} ok`, {
          duration_ms: Date.now() - startTime,
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        result = {
          commandId: msg.id,
          success: false,
          data: null,
          error: errorMsg,
        };
        extLog(client, "error", "command", `${payload.command} failed: ${errorMsg}`, {
          duration_ms: Date.now() - startTime,
          stack: err instanceof Error ? err.stack : undefined,
        });
      }
    }

    client.send(createMessage("browser.result", msg.sessionId, result));
  });
}
