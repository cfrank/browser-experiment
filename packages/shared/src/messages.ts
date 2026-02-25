export type MessageType =
  | "session.create"
  | "session.message"
  | "session.cancel"
  | "session.chunk"
  | "session.toolUse"
  | "session.toolResult"
  | "session.done"
  | "session.error"
  | "browser.command"
  | "browser.result"
  | "storage.getAssets"
  | "storage.assets"
  | "extension.hello"
  | "extension.log";

export interface Message<T = unknown> {
  id: string;
  sessionId: string;
  type: MessageType;
  payload: T;
  timestamp: number;
}

export interface SessionCreatePayload {
  domain: string;
  url: string;
}

export interface SessionMessagePayload {
  content: string;
}

export interface SessionChunkPayload {
  delta: string;
}

export interface SessionToolUsePayload {
  toolName: string;
  toolId: string;
  input: Record<string, unknown>;
}

export interface SessionToolResultPayload {
  toolId: string;
  output: string;
  isError: boolean;
}

export interface SessionDonePayload {
  fullText: string;
}

export interface SessionErrorPayload {
  error: string;
  code?: string;
}

export type BrowserCommandName =
  | "screenshot"
  | "console_logs"
  | "network_logs"
  | "inject_script"
  | "inject_style"
  | "read_dom"
  | "get_url"
  | "navigate"
  | "open_tab"
  | "open_window";

export interface BrowserCommandPayload {
  command: BrowserCommandName;
  args: Record<string, unknown>;
}

export interface BrowserResultPayload {
  commandId: string;
  success: boolean;
  data: unknown;
  error?: string;
}

export interface StorageGetAssetsPayload {
  domain: string;
}

export interface StorageAssetsPayload {
  domain: string;
  scripts: { name: string; content: string }[];
  styles: { name: string; content: string }[];
}

export interface ExtensionHelloPayload {
  manifestVersion: string;
  buildHash: string;
  userAgent: string;
}

export interface ExtensionLogPayload {
  level: "debug" | "info" | "warn" | "error";
  category: string;
  message: string;
  data?: unknown;
}

export function createMessage<T>(
  type: MessageType,
  sessionId: string,
  payload: T,
): Message<T> {
  return {
    id: crypto.randomUUID(),
    sessionId,
    type,
    payload,
    timestamp: Date.now(),
  };
}

export function parseMessage(raw: string): Message {
  return JSON.parse(raw) as Message;
}
