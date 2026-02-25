const RELOAD_PORT = 8791;

export function initDevReload() {
  let ws: WebSocket | null = null;

  function connect() {
    ws = new WebSocket(`ws://localhost:${RELOAD_PORT}`);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "reload") {
          console.log("[dev-reload] reloading extension...");
          chrome.runtime.reload();
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      ws = null;
      setTimeout(connect, 1000);
    };

    ws.onerror = () => {
      ws?.close();
    };
  }

  connect();
}
