import { existsSync, mkdirSync, readdirSync, readFileSync } from "fs";
import { join } from "path";

export interface WorkspaceAssets {
  scripts: { path: string; content: string }[];
  styles: { path: string; content: string }[];
}

export class WorkspaceManager {
  constructor(private storageDir: string) {}

  getWorkspacePath(domain: string): string {
    const dir = join(this.storageDir, domain);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  getAssets(domain: string): WorkspaceAssets {
    const dir = join(this.storageDir, domain);
    const result: WorkspaceAssets = { scripts: [], styles: [] };

    const scriptsDir = join(dir, "scripts");
    if (existsSync(scriptsDir)) {
      for (const file of readdirSync(scriptsDir)) {
        if (file.endsWith(".js")) {
          const filePath = join(scriptsDir, file);
          result.scripts.push({
            path: filePath,
            content: readFileSync(filePath, "utf-8"),
          });
        }
      }
    }

    const stylesDir = join(dir, "styles");
    if (existsSync(stylesDir)) {
      for (const file of readdirSync(stylesDir)) {
        if (file.endsWith(".css")) {
          const filePath = join(stylesDir, file);
          result.styles.push({
            path: filePath,
            content: readFileSync(filePath, "utf-8"),
          });
        }
      }
    }

    return result;
  }
}
