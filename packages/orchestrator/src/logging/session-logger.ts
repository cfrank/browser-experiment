import { appendFile, mkdir, writeFile } from "fs/promises";
import { join } from "path";

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogCategory =
  | "session"
  | "api"
  | "message"
  | "tool"
  | "extension"
  | "error";

interface LogEntry {
  ts: string;
  elapsed_ms: number;
  level: LogLevel;
  cat: LogCategory;
  event: string;
  data?: Record<string, unknown>;
}

const TRUNCATE_LIMIT = 500;

function truncate(s: string, limit = TRUNCATE_LIMIT): string {
  if (s.length <= limit) return s;
  return s.slice(0, limit) + `... [${s.length - limit} more chars]`;
}

export class SessionLogger {
  private filepath: string;
  private startTime: number;
  private ready: Promise<void>;

  constructor(
    logsDir: string,
    private sessionId: string,
  ) {
    this.filepath = join(logsDir, `${sessionId}.jsonl`);
    this.startTime = Date.now();
    this.ready = mkdir(logsDir, { recursive: true }).then(() =>
      writeFile(this.filepath, "", "utf-8"),
    );
  }

  private async append(entry: LogEntry): Promise<void> {
    await this.ready;
    const line = JSON.stringify(entry) + "\n";
    await appendFile(this.filepath, line, "utf-8");
  }

  private entry(
    level: LogLevel,
    cat: LogCategory,
    event: string,
    data?: Record<string, unknown>,
  ): void {
    const entry: LogEntry = {
      ts: new Date().toISOString(),
      elapsed_ms: Date.now() - this.startTime,
      level,
      cat,
      event,
      ...(data && { data }),
    };
    this.append(entry).catch((err) =>
      console.error(`[log] write failed for ${this.sessionId}:`, err),
    );
  }

  sessionCreated(opts: {
    domain: string;
    url: string;
    skillCount: number;
    systemPromptLength: number;
  }): void {
    this.entry("info", "session", "created", {
      session_id: this.sessionId,
      domain: opts.domain,
      url: opts.url,
      skill_count: opts.skillCount,
      system_prompt_chars: opts.systemPromptLength,
    });
  }

  sessionCancelled(): void {
    this.entry("info", "session", "cancelled");
  }

  sessionError(error: string, stack?: string): void {
    this.entry("error", "error", "session_error", {
      error,
      ...(stack && { stack: truncate(stack, 1000) }),
    });
  }

  userMessage(content: string): void {
    this.entry("info", "message", "user", {
      content: truncate(content),
      full_length: content.length,
    });
  }

  agentResponse(text: string, blockCount: number): void {
    this.entry("info", "message", "agent", {
      text: truncate(text),
      full_length: text.length,
      content_blocks: blockCount,
    });
  }

  apiRequest(opts: {
    model: string;
    maxTokens: number;
    messageCount: number;
    estimatedInputChars: number;
    toolCount: number;
  }): void {
    this.entry("info", "api", "request", {
      model: opts.model,
      max_tokens: opts.maxTokens,
      message_count: opts.messageCount,
      estimated_input_chars: opts.estimatedInputChars,
      estimated_input_tokens: Math.round(opts.estimatedInputChars / 4),
      tool_count: opts.toolCount,
    });
  }

  apiResponse(opts: {
    model: string;
    stopReason: string | null;
    inputTokens: number;
    outputTokens: number;
    durationMs: number;
  }): void {
    this.entry("info", "api", "response", {
      model: opts.model,
      stop_reason: opts.stopReason,
      input_tokens: opts.inputTokens,
      output_tokens: opts.outputTokens,
      duration_ms: opts.durationMs,
    });
  }

  toolCall(opts: {
    toolId: string;
    toolName: string;
    input: Record<string, unknown>;
  }): void {
    const inputStr = JSON.stringify(opts.input);
    this.entry("info", "tool", "call", {
      tool_id: opts.toolId,
      tool_name: opts.toolName,
      input: truncate(inputStr),
      input_length: inputStr.length,
    });
  }

  toolResult(opts: {
    toolId: string;
    toolName: string;
    output: string;
    isError: boolean;
    durationMs: number;
    offloaded: boolean;
  }): void {
    this.entry(opts.isError ? "warn" : "info", "tool", "result", {
      tool_id: opts.toolId,
      tool_name: opts.toolName,
      output: truncate(opts.output),
      output_length: opts.output.length,
      is_error: opts.isError,
      duration_ms: opts.durationMs,
      offloaded: opts.offloaded,
    });
  }

  extensionHello(opts: {
    manifestVersion: string;
    buildHash: string;
    userAgent: string;
  }): void {
    this.entry("info", "extension", "hello", {
      manifest_version: opts.manifestVersion,
      build_hash: opts.buildHash,
      user_agent: opts.userAgent,
    });
  }

  extensionConnected(): void {
    this.entry("info", "extension", "connected");
  }

  extensionDisconnected(): void {
    this.entry("warn", "extension", "disconnected");
  }

  extensionLog(opts: {
    level: LogLevel;
    category: string;
    message: string;
    data?: unknown;
  }): void {
    this.entry(opts.level, "extension", `ext:${opts.category}`, {
      message: opts.message,
      ...(opts.data !== undefined && { data: opts.data }),
    });
  }

  conversationPruned(opts: {
    removedMessages: number;
    charsBefore: number;
    charsAfter: number;
  }): void {
    this.entry("warn", "session", "pruned", {
      removed_messages: opts.removedMessages,
      chars_before: opts.charsBefore,
      chars_after: opts.charsAfter,
    });
  }

  debug(event: string, data?: Record<string, unknown>): void {
    this.entry("debug", "session", event, data);
  }
}
