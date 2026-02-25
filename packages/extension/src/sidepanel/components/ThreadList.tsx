import type { Thread } from "../hooks/useThreads.js";

interface ThreadListProps {
  threads: Thread[];
  onSelectSession: (sessionId: string) => void;
  onNewChat: () => void;
}

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ThreadList({ threads, onSelectSession, onNewChat }: ThreadListProps) {
  if (threads.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.empty}>
          <div style={styles.emptyIcon}>&#x1F310;</div>
          <p style={styles.emptyTitle}>No conversations yet</p>
          <p style={styles.emptySubtitle}>
            Start a conversation to customize your browsing experience
          </p>
          <button onClick={onNewChat} style={styles.startBtn}>
            Start a conversation
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {threads.map((thread) => (
        <button
          key={thread.id}
          onClick={() => onSelectSession(thread.id)}
          style={styles.threadItem}
        >
          <div style={styles.threadHeader}>
            <span style={styles.threadDomain}>{thread.domain || "General"}</span>
            <span style={styles.threadTime}>{timeAgo(thread.timestamp)}</span>
          </div>
          {thread.lastMessage && (
            <div style={styles.threadPreview}>{thread.lastMessage}</div>
          )}
        </button>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    overflow: "auto",
    padding: "4px",
  },
  empty: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    gap: "8px",
    padding: "24px",
    textAlign: "center",
  },
  emptyIcon: {
    fontSize: "32px",
    marginBottom: "4px",
  },
  emptyTitle: {
    fontSize: "14px",
    fontWeight: 600,
    color: "var(--text)",
  },
  emptySubtitle: {
    fontSize: "12px",
    color: "var(--text-secondary)",
    lineHeight: "1.4",
  },
  startBtn: {
    marginTop: "8px",
    padding: "8px 20px",
    fontSize: "13px",
    fontWeight: 500,
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    background: "var(--accent)",
    color: "var(--accent-text)",
  },
  threadItem: {
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: "10px 12px",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    background: "transparent",
    color: "var(--text)",
    marginBottom: "2px",
    transition: "background 0.1s ease",
    fontFamily: "inherit",
    fontSize: "13px",
  },
  threadHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "2px",
  },
  threadDomain: {
    fontWeight: 600,
    fontSize: "13px",
  },
  threadTime: {
    fontSize: "11px",
    color: "var(--text-secondary)",
    flexShrink: 0,
  },
  threadPreview: {
    fontSize: "12px",
    color: "var(--text-secondary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
};
