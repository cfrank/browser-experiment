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
const SCREENSHOT_WINDOW_MS = 120_000;

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

function getScreenshotCooldown(timestamps: number[]): number {
  const now = Date.now();
  while (timestamps.length > 0 && now - timestamps[0] > SCREENSHOT_WINDOW_MS) {
    timestamps.shift();
  }
  const count = timestamps.length;
  if (count >= 5) return 20_000;
  if (count >= 3) return 10_000;
  return 5_000;
}

export function createBrowserToolExecutor(server: OrchestratorServer) {
  let lastScreenshotTime = 0;
  const screenshotTimestamps: number[] = [];

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
      const cooldown = getScreenshotCooldown(screenshotTimestamps);
      const elapsed = now - lastScreenshotTime;
      if (lastScreenshotTime > 0 && elapsed < cooldown) {
        const waitSec = ((cooldown - elapsed) / 1000).toFixed(1);
        const recentCount = screenshotTimestamps.length;
        let msg = `Screenshot rate-limited: wait ${waitSec}s.`;
        if (recentCount >= 3) {
          msg += ` You've taken ${recentCount} screenshots in the last 2 minutes — cooldown has increased to ${cooldown / 1000}s. Use inject_script or read_dom to verify page state instead.`;
        } else {
          msg += " Use inject_script or read_dom to check page state instead.";
        }
        return msg;
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
      const now = Date.now();
      lastScreenshotTime = now;
      screenshotTimestamps.push(now);

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
