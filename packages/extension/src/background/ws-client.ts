import { type Message, parseMessage } from "@browser-experiment/shared";

const ORCHESTRATOR_PORT = 8790;
const RECONNECT_INTERVAL_MS = 2000;

export type MessageHandler = (message: Message) => void;

export class OrchestratorClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, MessageHandler>();
  private connectCallbacks: Array<() => void> = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private port: number = ORCHESTRATOR_PORT) {}

  onMessage(type: string, handler: MessageHandler): void {
    this.handlers.set(type, handler);
  }

  onConnect(callback: () => void): void {
    this.connectCallbacks.push(callback);
  }

  send(message: Message): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn("[ws-client] not connected, dropping message:", message.type);
    }
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.ws = new WebSocket(`ws://localhost:${this.port}`);

    this.ws.onopen = () => {
      console.log("[ws-client] connected to orchestrator");
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      for (const cb of this.connectCallbacks) {
        try { cb(); } catch (e) { console.error("[ws-client] onConnect callback error:", e); }
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const message = parseMessage(event.data as string);
        const handler = this.handlers.get(message.type);
        if (handler) {
          handler(message);
        } else {
          console.warn(
            "[ws-client] no handler for message type:",
            message.type,
          );
        }
      } catch (err) {
        console.error("[ws-client] failed to parse message:", err);
      }
    };

    this.ws.onclose = () => {
      console.log("[ws-client] disconnected, will reconnect...");
      this.ws = null;
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, RECONNECT_INTERVAL_MS);
  }
}
