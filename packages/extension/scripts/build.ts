import * as esbuild from "esbuild";
import { readFile, copyFile, mkdir } from "fs/promises";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

async function readManifestVersion(): Promise<string> {
  const raw = await readFile(resolve(ROOT, "manifest.json"), "utf-8");
  return JSON.parse(raw).version;
}

const commonOptions: esbuild.BuildOptions = {
  bundle: true,
  minify: true,
  sourcemap: false,
  target: "chrome120",
  define: {
    __DEV__: "false",
  },
};

export async function build() {
  const manifestVersion = await readManifestVersion();
  const buildHash = createHash("sha256")
    .update(Date.now().toString() + Math.random().toString())
    .digest("hex")
    .slice(0, 12);

  const versionDefines = {
    __EXT_VERSION__: JSON.stringify(manifestVersion),
    __EXT_BUILD_HASH__: JSON.stringify(buildHash),
  };

  await esbuild.build({
    ...commonOptions,
    entryPoints: [resolve(ROOT, "src/background/index.ts")],
    outfile: resolve(ROOT, "dist/background.js"),
    format: "esm",
    define: { ...commonOptions.define, ...versionDefines },
  });

  await esbuild.build({
    ...commonOptions,
    entryPoints: [resolve(ROOT, "src/sidepanel/index.tsx")],
    outfile: resolve(ROOT, "dist/sidepanel.js"),
    format: "iife",
    jsx: "automatic",
    define: { ...commonOptions.define, ...versionDefines },
  });

  await esbuild.build({
    ...commonOptions,
    entryPoints: [resolve(ROOT, "src/content/index.ts")],
    outfile: resolve(ROOT, "dist/content.js"),
    format: "iife",
    define: { ...commonOptions.define, ...versionDefines },
  });

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

  console.log("[build] production build complete");
}

build().catch((err) => {
  console.error("[build] failed:", err);
  process.exit(1);
});
