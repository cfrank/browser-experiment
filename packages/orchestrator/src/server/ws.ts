import { WebSocketServer, WebSocket } from "ws";
import { type Message, parseMessage } from "@browser-experiment/shared";

export type MessageHandler = (
  message: Message,
  send: (msg: Message) => void,
) => void;

export class OrchestratorServer {
  private wss: WebSocketServer | null = null;
  private connection: WebSocket | null = null;
  private handlers = new Map<string, MessageHandler>();
  private connectCallbacks: Array<() => void> = [];
  private disconnectCallbacks: Array<() => void> = [];
  private pendingBrowserCommands = new Map<
    string,
    { resolve: (msg: Message) => void; reject: (err: Error) => void }
  >();

  constructor(private port: number = 8790) {}

  onConnect(callback: () => void): void {
    this.connectCallbacks.push(callback);
  }

  onDisconnect(callback: () => void): void {
    this.disconnectCallbacks.push(callback);
  }

  onMessage(type: string, handler: MessageHandler): void {
    this.handlers.set(type, handler);
  }

  send(message: Message): void {
    if (this.connection?.readyState === WebSocket.OPEN) {
      this.connection.send(JSON.stringify(message));
    }
  }

  sendBrowserCommand(message: Message): Promise<Message> {
    return new Promise((resolve, reject) => {
      this.pendingBrowserCommands.set(message.id, { resolve, reject });
      this.send(message);

      setTimeout(() => {
        if (this.pendingBrowserCommands.has(message.id)) {
          this.pendingBrowserCommands.delete(message.id);
          reject(new Error("Browser command timed out"));
        }
      }, 30_000);
    });
  }

  get isConnected(): boolean {
    return this.connection?.readyState === WebSocket.OPEN;
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      this.wss = new WebSocketServer({ port: this.port });

      this.wss.on("connection", (ws) => {
        console.log("[ws] extension connected");
        this.connection = ws;
        for (const cb of this.connectCallbacks) {
          try { cb(); } catch (e) { console.error("[ws] onConnect callback error:", e); }
        }

        ws.on("message", (raw) => {
          try {
            const message = parseMessage(raw.toString());
            this.routeMessage(message);
          } catch (err) {
            console.error("[ws] failed to parse message:", err);
          }
        });

        ws.on("close", () => {
          console.log("[ws] extension disconnected");
          this.connection = null;
          for (const cb of this.disconnectCallbacks) {
            try { cb(); } catch (e) { console.error("[ws] onDisconnect callback error:", e); }
          }
        });

        ws.on("error", (err) => {
          console.error("[ws] connection error:", err);
        });
      });

      this.wss.on("listening", () => {
        console.log(`[ws] orchestrator listening on port ${this.port}`);
        resolve();
      });
    });
  }

  stop(): void {
    this.connection?.close();
    this.wss?.close();
  }

  private routeMessage(message: Message): void {
    if (message.type === "browser.result") {
      const pending = this.pendingBrowserCommands.get(
        (message.payload as { commandId: string }).commandId,
      );
      if (pending) {
        this.pendingBrowserCommands.delete(
          (message.payload as { commandId: string }).commandId,
        );
        pending.resolve(message);
      }
      return;
    }

    const handler = this.handlers.get(message.type);
    if (handler) {
      handler(message, (msg) => this.send(msg));
    } else {
      console.warn(`[ws] no handler for message type: ${message.type}`);
    }
  }
}
