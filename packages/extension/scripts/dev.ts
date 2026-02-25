import * as esbuild from "esbuild";
import { readFile, copyFile, mkdir } from "fs/promises";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";
import { WebSocketServer, WebSocket } from "ws";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const RELOAD_PORT = 8791;

const reloadClients = new Set<WebSocket>();

function startReloadServer() {
  const wss = new WebSocketServer({ port: RELOAD_PORT });

  wss.on("connection", (ws) => {
    reloadClients.add(ws);
    ws.on("close", () => reloadClients.delete(ws));
  });

  wss.on("listening", () => {
    console.log(`[dev] reload server on ws://localhost:${RELOAD_PORT}`);
  });

  return wss;
}

function notifyReload() {
  const msg = JSON.stringify({ type: "reload" });
  for (const client of reloadClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

async function readManifestVersion(): Promise<string> {
  const raw = await readFile(resolve(ROOT, "manifest.json"), "utf-8");
  return JSON.parse(raw).version;
}

function makeBuildHash(): string {
  return createHash("sha256")
    .update(Date.now().toString() + Math.random().toString())
    .digest("hex")
    .slice(0, 12);
}

const commonOptions: esbuild.BuildOptions = {
  bundle: true,
  minify: false,
  sourcemap: "inline",
  target: "chrome120",
  define: {
    __DEV__: "true",
  },
};

async function dev() {
  await mkdir(resolve(ROOT, "dist"), { recursive: true });

  startReloadServer();

  const manifestVersion = await readManifestVersion();
  let buildHash = makeBuildHash();

  const versionDefines = {
    __EXT_VERSION__: JSON.stringify(manifestVersion),
    __EXT_BUILD_HASH__: JSON.stringify(buildHash),
  };

  const onRebuild: esbuild.Plugin = {
    name: "reload-notify",
    setup(build) {
      build.onStart(() => {
        buildHash = makeBuildHash();
        build.initialOptions.define = {
          ...build.initialOptions.define,
          __EXT_BUILD_HASH__: JSON.stringify(buildHash),
        };
      });
      build.onEnd((result) => {
        if (result.errors.length === 0) {
          console.log(`[dev] rebuilt (${new Date().toLocaleTimeString()}) hash=${buildHash}`);
          notifyReload();
        } else {
          console.error("[dev] build errors:", result.errors);
        }
      });
    },
  };

  const bgCtx = await esbuild.context({
    ...commonOptions,
    entryPoints: [resolve(ROOT, "src/background/index.ts")],
    outfile: resolve(ROOT, "dist/background.js"),
    format: "esm",
    define: { ...commonOptions.define, ...versionDefines },
    plugins: [onRebuild],
  });

  const spCtx = await esbuild.context({
    ...commonOptions,
    entryPoints: [resolve(ROOT, "src/sidepanel/index.tsx")],
    outfile: resolve(ROOT, "dist/sidepanel.js"),
    format: "iife",
    jsx: "automatic",
    define: { ...commonOptions.define, ...versionDefines },
    plugins: [onRebuild],
  });

  const csCtx = await esbuild.context({
    ...commonOptions,
    entryPoints: [resolve(ROOT, "src/content/index.ts")],
    outfile: resolve(ROOT, "dist/content.js"),
    format: "iife",
    define: { ...commonOptions.define, ...versionDefines },
    plugins: [onRebuild],
  });

  await Promise.all([bgCtx.watch(), spCtx.watch(), csCtx.watch()]);

  await copyFile(
    resolve(ROOT, "src/sidepanel/index.html"),
    resolve(ROOT, "dist/sidepanel.html"),
  );

  await copyFile(
    resolve(ROOT, "manifest.json"),
    resolve(ROOT, "dist/manifest.json"),
  );

  await mkdir(resolve(ROOT, "dist/rules"), { recursive: true });
  await copyFile(
    resolve(ROOT, "rules/strip_csp.json"),
    resolve(ROOT, "dist/rules/strip_csp.json"),
  );

  console.log("[dev] watching for changes...");
}

dev().catch((err) => {
  console.error("[dev] failed:", err);
  process.exit(1);
});
