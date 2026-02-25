import { useState, useCallback, useEffect } from "react";
import { ThreadList } from "./components/ThreadList.js";
import { ChatThread } from "./components/ChatThread.js";
import { ChatInput } from "./components/ChatInput.js";
import { ConnectionStatus } from "./components/ConnectionStatus.js";
import { useSession } from "./hooks/useSession.js";
import { useThreads } from "./hooks/useThreads.js";

export function App() {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const { messages, isStreaming, sendMessage, createSession, cancelSession } = useSession(activeSessionId);
  const { threads, addThread, updateThread } = useThreads();

  const handleNewChat = useCallback(async () => {
    const sessionId = await createSession();
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    let domain = "";
    try {
      domain = new URL(tab?.url ?? "").hostname;
    } catch { /* ignore */ }
    addThread(sessionId, domain);
    setActiveSessionId(sessionId);
  }, [createSession, addThread]);

  const handleSend = useCallback(
    (text: string) => {
      if (activeSessionId) {
        sendMessage(text);
        updateThread(activeSessionId, {
          lastMessage: text.slice(0, 80),
        });
      }
    },
    [activeSessionId, sendMessage, updateThread],
  );

  const handleBack = useCallback(() => {
    setActiveSessionId(null);
  }, []);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        {activeSessionId ? (
          <button onClick={handleBack} style={styles.backBtn} title="Back to threads">
            &larr;
          </button>
        ) : null}
        <span style={styles.title}>Browser Agent</span>
        <div style={styles.headerRight}>
          <ConnectionStatus />
          <button onClick={handleNewChat} style={styles.newChatBtn}>
            +
          </button>
        </div>
      </div>
      {activeSessionId ? (
        <>
          <ChatThread messages={messages} isStreaming={isStreaming} />
          <ChatInput onSend={handleSend} onStop={cancelSession} disabled={isStreaming} autoFocus />
        </>
      ) : (
        <ThreadList
          threads={threads}
          onSelectSession={setActiveSessionId}
          onNewChat={handleNewChat}
        />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 12px",
    borderBottom: "1px solid var(--border)",
    flexShrink: 0,
  },
  title: {
    fontWeight: 600,
    fontSize: "14px",
    flex: 1,
  },
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  backBtn: {
    padding: "2px 6px",
    fontSize: "16px",
    fontWeight: 500,
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    background: "transparent",
    color: "var(--text)",
    lineHeight: 1,
  },
  newChatBtn: {
    width: "28px",
    height: "28px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "18px",
    fontWeight: 400,
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    background: "var(--accent)",
    color: "var(--accent-text)",
    lineHeight: 1,
  },
};
