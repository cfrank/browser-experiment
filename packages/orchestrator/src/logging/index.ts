import { SessionLogger } from "./session-logger.js";

export { SessionLogger } from "./session-logger.js";

export class LogManager {
  private loggers = new Map<string, SessionLogger>();
  private globalLogger: SessionLogger;

  constructor(private logsDir: string) {
    this.globalLogger = new SessionLogger(logsDir, "_orchestrator");
  }

  create(sessionId: string): SessionLogger {
    const logger = new SessionLogger(this.logsDir, sessionId);
    this.loggers.set(sessionId, logger);
    return logger;
  }

  get(sessionId: string): SessionLogger | undefined {
    return this.loggers.get(sessionId);
  }

  get global(): SessionLogger {
    return this.globalLogger;
  }
}
