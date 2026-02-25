import { useState, useCallback, useEffect } from "react";

export interface Thread {
  id: string;
  domain: string;
  title: string;
  lastMessage: string;
  timestamp: number;
}

const STORAGE_KEY = "browser-agent-threads";

function loadThreads(): Thread[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveThreads(threads: Thread[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(threads));
}

export function useThreads() {
  const [threads, setThreads] = useState<Thread[]>(loadThreads);

  useEffect(() => {
    saveThreads(threads);
  }, [threads]);

  const addThread = useCallback((id: string, domain: string) => {
    setThreads((prev) => [
      {
        id,
        domain,
        title: domain || "New conversation",
        lastMessage: "",
        timestamp: Date.now(),
      },
      ...prev,
    ]);
  }, []);

  const updateThread = useCallback(
    (id: string, updates: Partial<Pick<Thread, "lastMessage" | "title">>) => {
      setThreads((prev) =>
        prev.map((t) =>
          t.id === id
            ? { ...t, ...updates, timestamp: Date.now() }
            : t,
        ),
      );
    },
    [],
  );

  const removeThread = useCallback((id: string) => {
    setThreads((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { threads, addThread, updateThread, removeThread };
}
