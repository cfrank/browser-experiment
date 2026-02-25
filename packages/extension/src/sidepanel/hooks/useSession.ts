import { useState, useEffect, useCallback, useRef } from "react";
import {
  type Message,
  type SessionChunkPayload,
  type SessionDonePayload,
  type SessionErrorPayload,
  type SessionToolUsePayload,
  type SessionToolResultPayload,
  createMessage,
} from "@browser-experiment/shared";

export interface ToolUseInfo {
  name: string;
  input: Record<string, unknown>;
  output?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "agent";
  content: string;
  toolUse?: ToolUseInfo;
  timestamp: number;
}

const STORAGE_PREFIX = "ba-messages:";
const SAVE_DEBOUNCE_MS = 500;

function storageKey(sessionId: string): string {
  return STORAGE_PREFIX + sessionId;
}

async function loadMessages(sessionId: string): Promise<ChatMessage[]> {
  const key = storageKey(sessionId);
  const result = await chrome.storage.local.get(key);
  return result[key] ?? [];
}

async function persistMessages(
  sessionId: string,
  messages: ChatMessage[],
): Promise<void> {
  await chrome.storage.local.set({ [storageKey(sessionId)]: messages });
}

function sendToBackground(message: Message): void {
  chrome.runtime.sendMessage({
    type: "orchestrator:send",
    payload: message,
  });
}

export function useSession(sessionId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const streamingRef = useRef<{ id: string; content: string } | null>(null);
  const pendingResultsRef = useRef<Map<string, SessionToolResultPayload>>(
    new Map(),
  );
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const messagesRef = useRef<ChatMessage[]>(messages);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Debounced persistence -- saves after activity settles
  useEffect(() => {
    if (!sessionId || !isLoaded) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (sessionIdRef.current === sessionId) {
        persistMessages(sessionId, messages);
      }
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [messages, sessionId, isLoaded]);

  // Load persisted messages and set up listener on session change
  useEffect(() => {
    if (!sessionId) {
      setMessages([]);
      setIsLoaded(false);
      return;
    }

    setIsStreaming(false);
    streamingRef.current = null;
    pendingResultsRef.current.clear();
    setIsLoaded(false);

    let cancelled = false;

    loadMessages(sessionId).then((saved) => {
      if (cancelled) return;
      setMessages(saved);
      setIsLoaded(true);
    });

    function applyToolResult(
      prev: ChatMessage[],
      payload: SessionToolResultPayload,
    ): ChatMessage[] {
      const idx = [...prev]
        .reverse()
        .findIndex((m) => m.toolUse && m.id === payload.toolId);
      if (idx === -1) return prev;
      const realIdx = prev.length - 1 - idx;
      const updated = [...prev];
      updated[realIdx] = {
        ...updated[realIdx],
        toolUse: {
          ...updated[realIdx].toolUse!,
          output: payload.output,
        },
      };
      return updated;
    }

    const listener = (msg: unknown) => {
      const raw = msg as Message;
      if (raw.sessionId !== sessionId) return;

      switch (raw.type) {
        case "session.chunk": {
          const payload = raw.payload as SessionChunkPayload;
          setIsStreaming(true);

          if (!streamingRef.current) {
            streamingRef.current = { id: raw.id, content: "" };
          }
          streamingRef.current.content += payload.delta;

          const current = streamingRef.current;
          setMessages((prev) => {
            const existing = prev.find((m) => m.id === current.id);
            if (existing) {
              return prev.map((m) =>
                m.id === current.id
                  ? { ...m, content: current.content }
                  : m,
              );
            }
            return [
              ...prev,
              {
                id: current.id,
                role: "agent",
                content: current.content,
                timestamp: Date.now(),
              },
            ];
          });
          break;
        }

        case "session.done": {
          const payload = raw.payload as SessionDonePayload;
          setIsStreaming(false);

          if (streamingRef.current) {
            const streamId = streamingRef.current.id;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === streamId ? { ...m, content: payload.fullText } : m,
              ),
            );
            streamingRef.current = null;
          }
          break;
        }

        case "session.error": {
          const payload = raw.payload as SessionErrorPayload;
          setIsStreaming(false);
          streamingRef.current = null;
          setMessages((prev) => [
            ...prev,
            {
              id: raw.id,
              role: "agent",
              content: `Error: ${payload.error}`,
              timestamp: Date.now(),
            },
          ]);
          break;
        }

        case "session.toolUse": {
          const payload = raw.payload as SessionToolUsePayload;
          streamingRef.current = null;
          const pendingResult = pendingResultsRef.current.get(
            payload.toolId,
          );
          if (pendingResult) {
            pendingResultsRef.current.delete(payload.toolId);
          }
          setMessages((prev) => {
            const withToolUse = [
              ...prev,
              {
                id: payload.toolId,
                role: "agent" as const,
                content: `Using tool: ${payload.toolName}`,
                toolUse: { name: payload.toolName, input: payload.input },
                timestamp: Date.now(),
              },
            ];
            return pendingResult
              ? applyToolResult(withToolUse, pendingResult)
              : withToolUse;
          });
          break;
        }

        case "session.toolResult": {
          const payload = raw.payload as SessionToolResultPayload;
          setMessages((prev) => {
            const result = applyToolResult(prev, payload);
            if (result === prev) {
              pendingResultsRef.current.set(payload.toolId, payload);
              return prev;
            }
            return result;
          });
          break;
        }
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => {
      cancelled = true;
      chrome.runtime.onMessage.removeListener(listener);
      sendToBackground(createMessage("session.cancel", sessionId, {}));
      // Flush pending save with latest messages via ref
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      persistMessages(sessionId, messagesRef.current);
    };
  }, [sessionId]);

  const sendMessage = useCallback(
    (content: string) => {
      if (!sessionId) return;

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "user",
          content,
          timestamp: Date.now(),
        },
      ]);

      sendToBackground(
        createMessage("session.message", sessionId, { content }),
      );
    },
    [sessionId],
  );

  const createSession = useCallback(async (): Promise<string> => {
    const id = crypto.randomUUID();
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    const url = tab?.url ?? "";
    let domain = "";
    try {
      domain = new URL(url).hostname;
    } catch {
      // ignore
    }

    sendToBackground(
      createMessage("session.create", id, { domain, url }),
    );

    setMessages([]);
    streamingRef.current = null;
    setIsStreaming(false);
    setIsLoaded(true);

    return id;
  }, []);

  const cancelSession = useCallback(() => {
    if (!sessionId) return;
    sendToBackground(createMessage("session.cancel", sessionId, {}));
    setIsStreaming(false);
    streamingRef.current = null;
  }, [sessionId]);

  return { messages, isStreaming, sendMessage, createSession, cancelSession };
}
