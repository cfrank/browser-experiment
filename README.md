# Browser Agent

An agentic LLM system that deeply integrates with your browser and host OS, giving you conversational control over your browsing experience. Chat with an AI agent through a Chrome extension sidebar, and it can take screenshots, inject scripts and styles, read the DOM, execute shell commands, and persist modifications across visits.

## Architecture

The project is a pnpm monorepo with three packages:

```
packages/
  shared/       Shared TypeScript types, message protocol, tool definitions, skill interfaces
  orchestrator/ Node.js server — manages LLM sessions, tool execution, skills, and storage
  extension/    Chrome Manifest V3 extension — sidebar UI, browser command execution, WebSocket bridge
```

**Communication flow:**

```
User <-> Extension sidebar (React)
              |
         chrome.runtime messages
              |
         Background service worker
              |
         WebSocket (localhost:8790)
              |
         Orchestrator server
              |
         Claude API (streaming)
```

The extension's background service worker maintains a persistent WebSocket connection to the orchestrator. The sidebar UI communicates with the background worker via `chrome.runtime` messaging. When the user sends a chat message, it flows through to the orchestrator, which runs an agentic loop against the Claude API. Tool calls are dispatched locally (bash, file ops) or bridged back to the extension (browser commands).

## Tools

The agent has access to five tools:

| Tool | Description |
|------|-------------|
| `bash` | Execute shell commands on the host OS |
| `read_file` | Read file contents |
| `write_file` | Create or overwrite files |
| `edit_file` | Find-and-replace within a file |
| `browser` | Execute commands in the user's browser |

The `browser` tool supports these commands:

- `screenshot` — capture the visible viewport (returned as an image to the model)
- `console_logs` / `network_logs` — read captured browser logs
- `inject_script` — execute JavaScript in the page's main world (supports async/Promises)
- `inject_style` — inject CSS into the page
- `read_dom` — read DOM content via selector
- `get_url` / `navigate` — get or change the current URL
- `open_tab` / `open_window` — open new tabs or windows
- `wait_for` — poll a JS expression until truthy

## Skills

Skills are domain-scoped instruction sets (Markdown files) that specialize the agent's behavior for specific websites. They live in the `skills/` directory, organized by domain:

```
skills/
  google.com/
    block-ads/SKILL.md
  finance.google.com/
    portfolio-helper/SKILL.md
```

Skills are resolved hierarchically. Visiting `finance.google.com` loads skills from both `finance.google.com/` and `google.com/`, with more-specific domains taking precedence for name collisions. Matched skill content is appended to the system prompt.

## Persistent Storage

Each domain gets a workspace directory under `storage/` where the agent can persist scripts and styles:

```
storage/
  example.com/
    scripts/   .js files auto-injected on page load
    styles/    .css files auto-injected on page load
```

When a tab finishes loading, the extension requests assets for that domain from the orchestrator, which reads from the workspace and sends them back for injection. This means agent-created modifications survive across browser sessions.

## Session Management

Each chat conversation is an independent session tied to the domain/URL where it was created. Sessions maintain a conversation history with the Claude API and run an agentic tool-use loop — the model can call tools, receive results, and continue reasoning until it produces a final text response.

Conversation history is automatically pruned to stay within context limits: old screenshots are stripped, tool results are truncated, and messages are dropped on a FIFO basis when the conversation exceeds size thresholds.

All sessions are logged as structured JSONL files under `logs/`, capturing API requests/responses, tool calls, token usage, and timing data.

## Setup

**Prerequisites:** Node.js, pnpm, and an `ANTHROPIC_API_KEY` environment variable.

```bash
pnpm install
pnpm build
```

## Running

Start both the orchestrator and extension dev build in watch mode:

```bash
pnpm dev
```

Or run them separately:

```bash
# Orchestrator only
pnpm --filter @browser-experiment/orchestrator dev

# Extension only
pnpm --filter @browser-experiment/extension dev
```

Then load the built extension from `packages/extension/dist/` as an unpacked extension in Chrome (`chrome://extensions` with Developer mode enabled). Click the extension icon to open the sidebar.

The orchestrator listens on `ws://localhost:8790` by default (configurable via `WS_PORT` env var).
