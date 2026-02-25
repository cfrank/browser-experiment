import { useState, useEffect } from "react";

export function ConnectionStatus() {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const check = () => {
      chrome.runtime.sendMessage(
        { type: "orchestrator:status" },
        (response) => {
          if (chrome.runtime.lastError) {
            setConnected(false);
            return;
          }
          setConnected(response?.connected ?? false);
        },
      );
    };

    check();
    const interval = setInterval(check, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      style={styles.indicator}
      title={connected ? "Connected to orchestrator" : "Disconnected"}
    >
      <div
        style={{
          ...styles.dot,
          background: connected ? "#34a853" : "#ea4335",
        }}
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  indicator: {
    display: "flex",
    alignItems: "center",
    padding: "4px",
  },
  dot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    transition: "background 0.2s ease",
  },
};
