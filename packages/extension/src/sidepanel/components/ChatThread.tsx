import { useRef, useEffect } from "react";
import type { ChatMessage } from "../hooks/useSession.js";
import { Markdown } from "./Markdown.js";

interface ChatThreadProps {
  messages: ChatMessage[];
  isStreaming: boolean;
}

export function ChatThread({ messages, isStreaming }: ChatThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  if (messages.length === 0) {
    return (
      <div style={styles.emptyContainer}>
        <p style={styles.emptyHint}>Send a message to get started</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {messages.map((msg) => {
        if (msg.toolUse) {
          return <ToolBlock key={msg.id} toolUse={msg.toolUse} />;
        }

        if (msg.role === "user") {
          return (
            <div key={msg.id} style={styles.messageRow}>
              <div style={{ ...styles.message, ...styles.userMsg }}>
                <div style={styles.content}>{msg.content}</div>
              </div>
            </div>
          );
        }

        return (
          <div key={msg.id} style={styles.messageRow}>
            <div style={{ ...styles.message, ...styles.agentMsg }}>
              <Markdown content={msg.content} />
            </div>
          </div>
        );
      })}
      {isStreaming && (
        <div style={styles.streamingRow}>
          <div style={styles.streamingDots}>
            <span style={{ ...styles.dot, animationDelay: "0ms" }} />
            <span style={{ ...styles.dot, animationDelay: "150ms" }} />
            <span style={{ ...styles.dot, animationDelay: "300ms" }} />
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}

function formatToolTitle(toolUse: NonNullable<ChatMessage["toolUse"]>): string {
  const { name, input } = toolUse;
  if (name === "browser" && input.command) {
    return `browser ${input.command}`;
  }
  return name;
}

function extractRelevantInput(toolUse: NonNullable<ChatMessage["toolUse"]>): string | null {
  const { name, input } = toolUse;

  switch (name) {
    case "bash":
      return (input.command as string) ?? null;
    case "read_file":
      return (input.path as string) ?? null;
    case "write_file":
      return (input.path as string) ?? null;
    case "edit_file":
      return (input.path as string) ?? null;
    case "browser": {
      const cmd = input.command as string;
      const args = input.args as Record<string, unknown> | undefined;
      if (!args) return null;
      switch (cmd) {
        case "inject_script":
          return (args.code as string) ?? null;
        case "inject_style":
          return (args.css as string) ?? null;
        case "read_dom":
          return (args.selector as string) ?? null;
        case "navigate":
          return (args.url as string) ?? null;
        default:
          return null;
      }
    }
    default:
      return JSON.stringify(input, null, 2);
  }
}

const OFFLOAD_PREFIX = "Output saved to: ";
const MAX_INLINE_DISPLAY = 1000;

function parseOffloadedOutput(output: string): { filePath: string; meta: string; preview: string } | null {
  if (!output.startsWith(OFFLOAD_PREFIX)) return null;

  const firstNewline = output.indexOf("\n");
  const filePath = output.slice(OFFLOAD_PREFIX.length, firstNewline === -1 ? undefined : firstNewline).trim();

  const previewStart = output.indexOf("Preview (");
  const preview = previewStart !== -1
    ? output.slice(output.indexOf("\n", previewStart) + 1)
    : "";

  const metaLine = firstNewline !== -1
    ? output.slice(firstNewline + 1, output.indexOf("\n", firstNewline + 1)).trim()
    : "";

  return { filePath, meta: metaLine, preview };
}

function truncateInlineOutput(output: string): { text: string; truncated: boolean } {
  if (output.length <= MAX_INLINE_DISPLAY) return { text: output, truncated: false };
  return { text: output.slice(0, MAX_INLINE_DISPLAY), truncated: true };
}

function handleFileClick(filePath: string) {
  chrome.tabs.create({ url: `file://${filePath}` });
}

function ToolResult({ output }: { output: string }) {
  const offloaded = parseOffloadedOutput(output);

  if (offloaded) {
    return (
      <div style={styles.toolResultSection}>
        <div style={styles.toolResultHeader}>
          <span style={styles.toolResultLabel}>result</span>
          <span style={styles.toolResultMeta}>{offloaded.meta}</span>
        </div>
        <div style={styles.toolResultFileRow}>
          <a
            href="#"
            onClick={(e) => { e.preventDefault(); handleFileClick(offloaded.filePath); }}
            style={styles.toolFileLink}
            title={offloaded.filePath}
          >
            {offloaded.filePath.split("/").pop()}
          </a>
          <span style={styles.toolFilePath}>{offloaded.filePath}</span>
        </div>
        {offloaded.preview && (
          <pre style={styles.toolOutputPre}>{offloaded.preview}</pre>
        )}
      </div>
    );
  }

  if (!output) {
    return (
      <div style={styles.toolResultSection}>
        <div style={styles.toolResultHeader}>
          <span style={styles.toolResultLabel}>result</span>
          <span style={styles.toolResultMeta}>(empty)</span>
        </div>
      </div>
    );
  }

  const { text, truncated } = truncateInlineOutput(output);
  return (
    <div style={styles.toolResultSection}>
      <div style={styles.toolResultHeader}>
        <span style={styles.toolResultLabel}>result</span>
      </div>
      <pre style={styles.toolOutputPre}>
        {text}{truncated ? "\n..." : ""}
      </pre>
    </div>
  );
}

function ToolBlock({ toolUse }: { toolUse: NonNullable<ChatMessage["toolUse"]> }) {
  const title = formatToolTitle(toolUse);
  const content = extractRelevantInput(toolUse);
  const hasOutput = toolUse.output !== undefined;

  return (
    <div style={styles.toolBlock}>
      <div style={styles.toolSummary}>
        <code style={styles.toolTitle}>{title}</code>
        {hasOutput && <span style={styles.toolDone}>done</span>}
      </div>
      {content && (
        <pre style={styles.toolPre}>{content}</pre>
      )}
      {hasOutput && (
        <ToolResult output={toolUse.output!} />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    overflow: "auto",
    padding: "8px 12px",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  emptyContainer: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyHint: {
    color: "var(--text-secondary)",
    fontSize: "13px",
  },
  messageRow: {
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
  },
  message: {
    padding: "8px 12px",
    borderRadius: "10px",
    maxWidth: "95%",
    wordBreak: "break-word",
  },
  userMsg: {
    background: "var(--msg-user-bg)",
    alignSelf: "flex-end",
    borderBottomRightRadius: "4px",
  },
  agentMsg: {
    alignSelf: "flex-start",
    padding: "4px 0",
  },
  content: {
    whiteSpace: "pre-wrap",
    lineHeight: "1.5",
  },
  streamingRow: {
    padding: "8px 0",
    flexShrink: 0,
  },
  streamingDots: {
    display: "flex",
    gap: "4px",
    alignItems: "center",
  },
  dot: {
    display: "inline-block",
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    background: "var(--text-secondary)",
    opacity: 0.6,
  },
  toolBlock: {
    width: "100%",
    border: "1px solid var(--border)",
    borderRadius: "6px",
    overflow: "hidden",
    fontSize: "12px",
    flexShrink: 0,
  },
  toolSummary: {
    cursor: "pointer",
    padding: "6px 10px",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    userSelect: "none" as const,
    background: "var(--bg-secondary)",
    borderBottom: "1px solid var(--border)",
  },
  toolTitle: {
    fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
    fontSize: "11px",
    fontWeight: 600,
    color: "var(--text)",
    background: "var(--bg)",
    padding: "1px 6px",
    borderRadius: "3px",
    border: "1px solid var(--border)",
  },
  toolDone: {
    fontSize: "10px",
    color: "#34a853",
    fontWeight: 500,
    marginLeft: "auto",
  },
  toolPre: {
    fontSize: "11px",
    fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
    whiteSpace: "pre-wrap",
    overflow: "auto",
    maxHeight: "150px",
    padding: "8px 10px",
    margin: 0,
    lineHeight: "1.4",
    color: "var(--text)",
    background: "var(--bg)",
  },
  toolResultSection: {
    borderTop: "1px solid var(--border)",
  },
  toolResultHeader: {
    padding: "4px 10px",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    background: "var(--bg-secondary)",
  },
  toolResultLabel: {
    fontSize: "10px",
    fontWeight: 600,
    color: "var(--text-secondary)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
  },
  toolResultMeta: {
    fontSize: "10px",
    color: "var(--text-secondary)",
    marginLeft: "auto",
  },
  toolResultFileRow: {
    padding: "6px 10px",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    borderBottom: "1px solid var(--border)",
    background: "var(--bg)",
  },
  toolFileLink: {
    fontSize: "11px",
    fontWeight: 600,
    color: "var(--accent)",
    textDecoration: "none",
    cursor: "pointer",
    flexShrink: 0,
  },
  toolFilePath: {
    fontSize: "10px",
    color: "var(--text-secondary)",
    fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  toolOutputPre: {
    fontSize: "11px",
    fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
    whiteSpace: "pre-wrap",
    overflow: "auto",
    maxHeight: "200px",
    padding: "8px 10px",
    margin: 0,
    lineHeight: "1.4",
    color: "var(--text-secondary)",
    background: "var(--bg)",
  },
};
