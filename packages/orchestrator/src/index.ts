import { resolve } from "path";
import {
  type StorageGetAssetsPayload,
  type ExtensionHelloPayload,
  type ExtensionLogPayload,
  createMessage,
} from "@browser-experiment/shared";
import { OrchestratorServer } from "./server/ws.js";
import { SessionManager } from "./sessions/manager.js";
import { ToolRegistry } from "./tools/registry.js";
import { executeBash } from "./tools/bash.js";
import { executeReadFile, executeWriteFile, executeEditFile } from "./tools/files.js";
import { createBrowserToolExecutor } from "./tools/browser.js";
import { SkillLoader } from "./skills/loader.js";
import { WorkspaceManager } from "./storage/workspace.js";
import { LogManager } from "./logging/index.js";

const WS_PORT = Number(process.env.WS_PORT ?? 8790);
const PROJECT_ROOT = resolve(import.meta.dirname, "../../../");
const SKILLS_DIR = resolve(PROJECT_ROOT, "skills");
const STORAGE_DIR = resolve(PROJECT_ROOT, "storage");
const LOGS_DIR = resolve(PROJECT_ROOT, "logs");

async function main() {
  const server = new OrchestratorServer(WS_PORT);
  const logManager = new LogManager(LOGS_DIR);

  const toolRegistry = new ToolRegistry();
  toolRegistry.register("bash", executeBash);
  toolRegistry.register("read_file", executeReadFile);
  toolRegistry.register("write_file", executeWriteFile);
  toolRegistry.register("edit_file", executeEditFile);
  toolRegistry.register("browser", createBrowserToolExecutor(server));

  const skillLoader = new SkillLoader(SKILLS_DIR);
  const workspaceManager = new WorkspaceManager(STORAGE_DIR);
  const sessionManager = new SessionManager(server, toolRegistry, skillLoader, logManager);

  server.onMessage("session.create", (msg, send) =>
    sessionManager.handleCreate(msg, send),
  );
  server.onMessage("session.message", (msg, send) =>
    sessionManager.handleMessage(msg, send),
  );
  server.onMessage("session.cancel", (msg) =>
    sessionManager.handleCancel(msg),
  );

  server.onMessage("storage.getAssets", (msg, send) => {
    const payload = msg.payload as StorageGetAssetsPayload;
    const assets = workspaceManager.getAssets(payload.domain);
    send(
      createMessage("storage.assets", msg.sessionId, {
        domain: payload.domain,
        scripts: assets.scripts.map((s) => ({
          name: s.path.split("/").pop()!,
          content: s.content,
        })),
        styles: assets.styles.map((s) => ({
          name: s.path.split("/").pop()!,
          content: s.content,
        })),
      }),
    );
  });

  server.onMessage("extension.hello", (msg) => {
    const payload = msg.payload as ExtensionHelloPayload;
    logManager.global.extensionHello(payload);
    console.log(
      `[orchestrator] extension hello: v${payload.manifestVersion} build=${payload.buildHash}`,
    );
  });

  server.onMessage("extension.log", (msg) => {
    const payload = msg.payload as ExtensionLogPayload;
    logManager.global.extensionLog(payload);
  });

  server.onConnect(() => logManager.global.extensionConnected());
  server.onDisconnect(() => logManager.global.extensionDisconnected());

  await server.start();
  console.log(`[orchestrator] running (ws port ${WS_PORT})`);
  console.log(`[orchestrator] skills dir: ${SKILLS_DIR}`);
  console.log(`[orchestrator] storage dir: ${STORAGE_DIR}`);
  console.log(`[orchestrator] logs dir: ${LOGS_DIR}`);

  process.on("SIGINT", () => {
    console.log("\n[orchestrator] shutting down...");
    server.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("[orchestrator] fatal error:", err);
  process.exit(1);
});
