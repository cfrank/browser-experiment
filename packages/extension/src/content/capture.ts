interface LogEntry {
  level: string;
  args: string[];
  timestamp: number;
}

interface NetworkEntry {
  method: string;
  url: string;
  status?: number;
  duration?: number;
  timestamp: number;
}

const MAX_ENTRIES = 200;

export class ConsoleCapture {
  private logs: LogEntry[] = [];
  private originals: Record<string, (...args: unknown[]) => void> = {};

  start() {
    const levels = ["log", "warn", "error", "info", "debug"] as const;

    for (const level of levels) {
      this.originals[level] = console[level].bind(console);
      console[level] = (...args: unknown[]) => {
        this.logs.push({
          level,
          args: args.map((a) => {
            try {
              return typeof a === "string" ? a : JSON.stringify(a);
            } catch {
              return String(a);
            }
          }),
          timestamp: Date.now(),
        });

        if (this.logs.length > MAX_ENTRIES) {
          this.logs.shift();
        }

        this.originals[level](...args);
      };
    }
  }

  flush(): LogEntry[] {
    const entries = [...this.logs];
    this.logs = [];
    return entries;
  }
}

export class NetworkCapture {
  private entries: NetworkEntry[] = [];
  private origOpen: typeof XMLHttpRequest.prototype.open | null = null;

  start() {
    const self = this;

    const origFetch = window.fetch;
    window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
      const url =
        input instanceof Request ? input.url : String(input);
      const method = init?.method ?? "GET";
      const ts = Date.now();

      try {
        const response = await origFetch.call(this, input, init);
        self.record({ method, url, status: response.status, duration: Date.now() - ts, timestamp: ts });
        return response;
      } catch (err) {
        self.record({ method, url, status: 0, duration: Date.now() - ts, timestamp: ts });
        throw err;
      }
    };

    this.origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (
      method: string,
      url: string | URL,
      ...rest: unknown[]
    ) {
      const ts = Date.now();
      this.addEventListener("loadend", () => {
        self.record({
          method,
          url: String(url),
          status: this.status,
          duration: Date.now() - ts,
          timestamp: ts,
        });
      });
      return (self.origOpen as Function).call(this, method, url, ...rest);
    };
  }

  private record(entry: NetworkEntry) {
    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.shift();
    }
  }

  flush(): NetworkEntry[] {
    const entries = [...this.entries];
    this.entries = [];
    return entries;
  }
}
