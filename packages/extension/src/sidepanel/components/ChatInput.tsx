import { useState, useCallback, useRef, useEffect, type KeyboardEvent } from "react";

interface ChatInputProps {
  onSend: (text: string) => void;
  onStop?: () => void;
  disabled: boolean;
  autoFocus?: boolean;
}

export function ChatInput({ onSend, onStop, disabled, autoFocus }: ChatInputProps) {
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus && textareaRef.current && !disabled) {
      textareaRef.current.focus();
    }
  }, [autoFocus, disabled]);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [text, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 120) + "px";
    }
  }, []);

  const canSend = !disabled && text.trim().length > 0;

  return (
    <div style={styles.wrapper}>
      <div
        style={{
          ...styles.container,
          ...(focused ? styles.containerFocused : {}),
        }}
      >
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={disabled ? "Waiting for response..." : "Ask anything..."}
          disabled={disabled}
          rows={1}
          style={{
            ...styles.textarea,
            ...(disabled ? styles.textareaDisabled : {}),
          }}
        />
        {disabled ? (
          <button
            onClick={onStop}
            style={{ ...styles.actionBtn, ...styles.stopBtn }}
            aria-label="Stop generation"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <rect x="4" y="4" width="16" height="16" rx="2" />
            </svg>
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!canSend}
            style={{
              ...styles.actionBtn,
              ...(canSend ? styles.sendBtnActive : styles.sendBtnIdle),
            }}
            aria-label="Send message"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    padding: "8px 12px 10px",
    flexShrink: 0,
  },
  container: {
    display: "flex",
    alignItems: "flex-end",
    gap: "2px",
    background: "var(--input-bg)",
    border: "1px solid var(--border)",
    borderRadius: "20px",
    padding: "4px 6px 4px 14px",
    transition: "border-color 0.15s ease, box-shadow 0.15s ease",
  },
  containerFocused: {
    borderColor: "var(--accent)",
    boxShadow: "0 0 0 1px var(--accent)",
  },
  textarea: {
    flex: 1,
    resize: "none" as const,
    border: "none",
    padding: "6px 0",
    fontSize: "13px",
    lineHeight: "1.4",
    fontFamily: "inherit",
    background: "transparent",
    color: "var(--text)",
    outline: "none",
    overflow: "hidden",
  },
  textareaDisabled: {
    opacity: 0.5,
  },
  actionBtn: {
    width: "30px",
    height: "30px",
    minWidth: "30px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    borderRadius: "50%",
    flexShrink: 0,
    transition: "background 0.15s ease, color 0.15s ease, opacity 0.15s ease",
  },
  sendBtnIdle: {
    background: "transparent",
    color: "var(--text-secondary)",
    cursor: "default",
    opacity: 0.4,
  },
  sendBtnActive: {
    background: "var(--accent)",
    color: "var(--accent-text)",
    cursor: "pointer",
    opacity: 1,
  },
  stopBtn: {
    background: "var(--text-secondary)",
    color: "var(--bg)",
    cursor: "pointer",
    opacity: 1,
  },
};
