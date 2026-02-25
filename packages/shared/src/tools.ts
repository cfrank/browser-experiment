export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

export interface ToolResultImage {
  mediaType: ImageMediaType;
  base64: string;
}

export interface ToolResult {
  toolId: string;
  output: string;
  isError: boolean;
  image?: ToolResultImage;
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "bash",
    description:
      "Execute a shell command on the host OS. Returns stdout and stderr.",
    input_schema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The shell command to execute",
        },
        timeout_ms: {
          type: "number",
          description: "Timeout in milliseconds (default: 30000)",
        },
      },
      required: ["command"],
    },
  },
  {
    name: "read_file",
    description: "Read the contents of a file at the given path.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Absolute or workspace-relative file path",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description:
      "Write content to a file, creating it if it does not exist and overwriting if it does.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Absolute or workspace-relative file path",
        },
        content: {
          type: "string",
          description: "The content to write",
        },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "edit_file",
    description:
      "Replace an exact string in a file with a new string. The old_string must appear exactly once in the file.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Absolute or workspace-relative file path",
        },
        old_string: {
          type: "string",
          description: "The exact string to find and replace",
        },
        new_string: {
          type: "string",
          description: "The replacement string",
        },
      },
      required: ["path", "old_string", "new_string"],
    },
  },
  {
    name: "browser",
    description:
      "Execute a command in the user's browser via the Chrome extension. Available commands: screenshot, console_logs, network_logs, inject_script, inject_style, read_dom, get_url, navigate.",
    input_schema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          enum: [
            "screenshot",
            "console_logs",
            "network_logs",
            "inject_script",
            "inject_style",
            "read_dom",
            "get_url",
            "navigate",
            "open_tab",
            "open_window",
          ],
          description: "The browser command to execute",
        },
        args: {
          type: "object",
          description:
            "Command-specific arguments. screenshot: {}. console_logs: {}. network_logs: {}. inject_script: { code: string }. inject_style: { css: string }. read_dom: { selector: string }. get_url: {}. navigate: { url: string }. open_tab: { url: string, active?: boolean }. open_window: { url: string, incognito?: boolean }. All URL args accept http://, https://, and file:// schemes.",
        },
      },
      required: ["command"],
    },
  },
];
