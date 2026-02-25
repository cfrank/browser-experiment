import {
  type Message,
  type SessionCreatePayload,
  type SessionMessagePayload,
  createMessage,
} from "@browser-experiment/shared";
import type { OrchestratorServer } from "../server/ws.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { SkillLoader } from "../skills/loader.js";
import type { LogManager } from "../logging/index.js";
import { Session } from "./session.js";

export class SessionManager {
  private sessions = new Map<string, Session>();

  constructor(
    private server: OrchestratorServer,
    private toolRegistry: ToolRegistry,
    private skillLoader: SkillLoader,
    private logManager: LogManager,
  ) {}

  handleCreate(msg: Message, send: (msg: Message) => void): void {
    const payload = msg.payload as SessionCreatePayload;
    const skills = this.skillLoader.resolve(payload.domain);
    const skillContent = skills
      .map((s) => `### ${s.name}\n\n${s.content}`)
      .join("\n\n");

    const logger = this.logManager.create(msg.sessionId);

    const session = new Session(
      msg.sessionId,
      payload.domain,
      payload.url,
      this.toolRegistry,
      logger,
      skillContent || undefined,
    );
    this.sessions.set(msg.sessionId, session);

    console.log(
      `[session] created ${msg.sessionId} for ${payload.domain} (${skills.length} skills)`,
    );

    send(
      createMessage("session.done", msg.sessionId, {
        fullText: "",
      }),
    );
  }

  handleMessage(msg: Message, send: (msg: Message) => void): void {
    const session = this.sessions.get(msg.sessionId);
    if (!session) {
      this.logManager.global.sessionError(
        `session not found: ${msg.sessionId}`,
      );
      send(
        createMessage("session.error", msg.sessionId, {
          error: "Session not found. Please start a new conversation.",
          code: "SESSION_NOT_FOUND",
        }),
      );
      return;
    }

    const payload = msg.payload as SessionMessagePayload;
    session.handleUserMessage(payload.content, send);
  }

  handleCancel(msg: Message): void {
    const session = this.sessions.get(msg.sessionId);
    if (session) {
      session.cancel();
    }
  }
}
