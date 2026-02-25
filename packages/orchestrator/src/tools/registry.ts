import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import {
  type ToolDefinition,
  type ToolResult,
  type ToolResultImage,
  TOOL_DEFINITIONS,
} from "@browser-experiment/shared";

export interface ToolExecutorOutput {
  text: string;
  image?: ToolResultImage;
}

export type ToolExecutor = (
  input: Record<string, unknown>,
) => Promise<string | ToolExecutorOutput>;

const OFFLOAD_THRESHOLD = 10_000;
const OFFLOAD_DIR = join(tmpdir(), "browser-agent-tool-output");
const PREVIEW_LINES = 20;

async function offloadToFile(
  toolName: string,
  output: string,
): Promise<string> {
  await mkdir(OFFLOAD_DIR, { recursive: true });

  const filename = `${toolName}-${Date.now()}.txt`;
  const filepath = join(OFFLOAD_DIR, filename);
  await writeFile(filepath, output, "utf-8");

  const lines = output.split("\n");
  const lineCount = lines.length;
  const preview = lines.slice(0, PREVIEW_LINES).join("\n");
  const byteCount = Buffer.byteLength(output, "utf-8");

  return [
    `Output saved to: ${filepath}`,
    `Size: ${byteCount} bytes, ${lineCount} lines`,
    ``,
    `Preview (first ${Math.min(PREVIEW_LINES, lineCount)} lines):`,
    preview,
    lineCount > PREVIEW_LINES ? `\n... ${lineCount - PREVIEW_LINES} more lines in file` : "",
  ].join("\n");
}

export class ToolRegistry {
  private executors = new Map<string, ToolExecutor>();

  register(name: string, executor: ToolExecutor): void {
    this.executors.set(name, executor);
  }

  get(name: string): ToolExecutor | undefined {
    return this.executors.get(name);
  }

  async execute(
    toolId: string,
    toolName: string,
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    const executor = this.executors.get(toolName);
    if (!executor) {
      return {
        toolId,
        output: `Unknown tool: ${toolName}`,
        isError: true,
      };
    }

    try {
      const raw = await executor(input);
      const text = typeof raw === "string" ? raw : raw.text;
      const image = typeof raw === "string" ? undefined : raw.image;

      let output: string;
      if (text.length > OFFLOAD_THRESHOLD) {
        console.log(
          `[tools] ${toolName} output offloaded: ${text.length} chars -> file`,
        );
        output = await offloadToFile(toolName, text);
      } else {
        output = text;
      }

      return { toolId, output, isError: false, image };
    } catch (err) {
      return {
        toolId,
        output: err instanceof Error ? err.message : String(err),
        isError: true,
      };
    }
  }

  getDefinitions(): ToolDefinition[] {
    return TOOL_DEFINITIONS.filter((def) => this.executors.has(def.name));
  }
}
