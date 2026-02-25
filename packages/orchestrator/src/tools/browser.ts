import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import {
  type BrowserCommandPayload,
  type BrowserResultPayload,
  type ImageMediaType,
  createMessage,
} from "@browser-experiment/shared";
import type { OrchestratorServer } from "../server/ws.js";
import type { ToolExecutorOutput } from "./registry.js";

const SCREENSHOT_DIR = join(tmpdir(), "browser-agent-screenshots");
const SCREENSHOT_COOLDOWN_MS = 5_000;

async function saveScreenshot(
  base64: string,
  mediaType: string,
): Promise<string> {
  await mkdir(SCREENSHOT_DIR, { recursive: true });

  const ext = mediaType.includes("jpeg") ? "jpg" : "png";
  const filename = `screenshot-${Date.now()}.${ext}`;
  const filepath = join(SCREENSHOT_DIR, filename);

  await writeFile(filepath, Buffer.from(base64, "base64"));
  return filepath;
}

function parseDataUrl(dataUrl: string): {
  mediaType: ImageMediaType;
  base64: string;
} {
  const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/s);
  if (!match) throw new Error("Invalid screenshot data URL");
  return { mediaType: match[1] as ImageMediaType, base64: match[2] };
}

export function createBrowserToolExecutor(server: OrchestratorServer) {
  let lastScreenshotTime = 0;

  return async function executeBrowser(
    input: Record<string, unknown>,
  ): Promise<string | ToolExecutorOutput> {
    const command = input.command as string;
    if (!command) throw new Error("browser tool requires a 'command' argument");

    if (!server.isConnected) {
      throw new Error("Browser extension is not connected");
    }

    if (command === "screenshot") {
      const now = Date.now();
      const elapsed = now - lastScreenshotTime;
      if (lastScreenshotTime > 0 && elapsed < SCREENSHOT_COOLDOWN_MS) {
        const waitSec = ((SCREENSHOT_COOLDOWN_MS - elapsed) / 1000).toFixed(1);
        return `Screenshot rate-limited: wait ${waitSec}s. Use inject_script or read_dom to check page state instead.`;
      }
    }

    const payload: BrowserCommandPayload = {
      command: command as BrowserCommandPayload["command"],
      args: (input.args as Record<string, unknown>) ?? {},
    };

    const msg = createMessage("browser.command", "system", payload);
    const response = await server.sendBrowserCommand(msg);
    const result = response.payload as BrowserResultPayload;

    if (!result.success) {
      throw new Error(result.error ?? "Browser command failed");
    }

    if (command === "screenshot" && typeof result.data === "string") {
      lastScreenshotTime = Date.now();

      const { mediaType, base64 } = parseDataUrl(result.data);
      const filepath = await saveScreenshot(base64, mediaType);

      return {
        text: `Screenshot captured and attached as image. Also saved to: ${filepath}`,
        image: { mediaType, base64 },
      };
    }

    return typeof result.data === "string"
      ? result.data
      : JSON.stringify(result.data, null, 2);
  };
}
