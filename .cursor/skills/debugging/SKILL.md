---
name: session-debugging
description: Debug browser-experiment sessions using structured JSONL log files. Use when investigating session issues, checking API token usage, tracing tool calls, finding errors in logs, or analyzing extension behavior.
---

# Session Debugging

Debug browser-experiment sessions using structured JSONL log files.

## Log Location

```
logs/
├── _orchestrator.jsonl    # Global orchestrator events (extension connect/disconnect, hello, ext logs)
└── <session-id>.jsonl     # Per-session log (one file per session)
```

The `<session-id>` matches the UUID shown in the side panel's thread list and in the orchestrator console output.

## Log Format

Each line is a JSON object (JSONL) with these fields:

| Field       | Type   | Description                                    |
|-------------|--------|------------------------------------------------|
| `ts`        | string | ISO 8601 timestamp                             |
| `elapsed_ms`| number | Milliseconds since session/logger was created  |
| `level`     | string | `debug`, `info`, `warn`, `error`               |
| `cat`       | string | Category (see below)                           |
| `event`     | string | Event name                                     |
| `data`      | object | Event-specific payload (optional)              |

### Categories

- **`session`** -- Session lifecycle: `created`, `cancelled`, `pruned`, `turn_complete`
- **`api`** -- Anthropic API calls: `request` (model, tokens est.), `response` (usage, stop reason, duration)
- **`message`** -- Conversation content: `user` (truncated), `agent` (truncated)
- **`tool`** -- Tool execution: `call` (name, truncated input), `result` (truncated output, duration, offloaded flag, error flag)
- **`extension`** -- Extension events: `hello` (version, build hash), `connected`, `disconnected`, `ext:<category>` (forwarded from extension)
- **`error`** -- Errors: `session_error` (message, stack)

## Key Events Reference

### `session` / `created`
```json
{ "session_id": "...", "domain": "example.com", "url": "https://example.com/page", "skill_count": 2, "system_prompt_chars": 4500 }
```

### `api` / `request`
```json
{ "model": "claude-opus-4-6", "max_tokens": 8192, "message_count": 5, "estimated_input_chars": 12000, "estimated_input_tokens": 3000, "tool_count": 5 }
```

### `api` / `response`
```json
{ "model": "claude-opus-4-6", "stop_reason": "tool_use", "input_tokens": 3200, "output_tokens": 450, "duration_ms": 8500 }
```

### `tool` / `call`
```json
{ "tool_id": "toolu_...", "tool_name": "bash", "input": "{\"command\":\"whoami\"}", "input_length": 22 }
```

### `tool` / `result`
```json
{ "tool_id": "toolu_...", "tool_name": "bash", "output": "cfrank\n", "output_length": 7, "is_error": false, "duration_ms": 120, "offloaded": false }
```

### `extension` / `hello`
```json
{ "manifest_version": "0.0.1", "build_hash": "a1b2c3d4e5f6", "user_agent": "..." }
```

### `session` / `pruned`
```json
{ "removed_messages": 4, "chars_before": 420000, "chars_after": 380000 }
```

## Debugging Workflows

### Quick session overview

```bash
# See all events for a session
cat logs/<session-id>.jsonl | jq .

# Just events and timing
cat logs/<session-id>.jsonl | jq '{elapsed_ms, cat, event}'

# Count events by category
cat logs/<session-id>.jsonl | jq -r .cat | sort | uniq -c | sort -rn
```

### Check extension version (stale extension?)

```bash
# Check the build hash reported by the extension
cat logs/_orchestrator.jsonl | jq 'select(.event == "hello") | .data'

# If the build hash is old, the extension needs a reload:
#   1. Check chrome://extensions for the extension
#   2. Click the refresh icon
#   3. Or press Ctrl+Shift+R on the side panel
```

### Investigate API costs / token usage

```bash
# See all API request/response pairs with token counts
cat logs/<session-id>.jsonl | jq 'select(.cat == "api") | {event, data: {model: .data.model, input_tokens: .data.input_tokens, output_tokens: .data.output_tokens, duration_ms: .data.duration_ms, stop_reason: .data.stop_reason}}'

# Total tokens used in a session
cat logs/<session-id>.jsonl | jq 'select(.event == "response") | .data.input_tokens + .data.output_tokens' | paste -sd+ | bc
```

### Find errors

```bash
# All errors in a session
cat logs/<session-id>.jsonl | jq 'select(.level == "error" or .level == "warn")'

# Tool errors specifically
cat logs/<session-id>.jsonl | jq 'select(.event == "result" and .data.is_error == true)'

# Extension-side errors
cat logs/_orchestrator.jsonl | jq 'select(.level == "error" and .cat == "extension")'
```

### Trace a tool call

```bash
# Find a specific tool call and its result by tool_id
TOOL_ID="toolu_..."
cat logs/<session-id>.jsonl | jq "select(.data.tool_id == \"$TOOL_ID\")"
```

### Check for conversation pruning

```bash
# See if/when the conversation was pruned
cat logs/<session-id>.jsonl | jq 'select(.event == "pruned")'
```

### Slow tool calls

```bash
# Tool calls sorted by duration
cat logs/<session-id>.jsonl | jq 'select(.event == "result") | {tool: .data.tool_name, ms: .data.duration_ms, error: .data.is_error}' | jq -s 'sort_by(.ms) | reverse'
```

### List all sessions

```bash
# List all session log files with creation time
ls -lt logs/*.jsonl | grep -v _orchestrator

# Get session domain for each log
for f in logs/*.jsonl; do
  id=$(basename "$f" .jsonl)
  [ "$id" = "_orchestrator" ] && continue
  domain=$(head -1 "$f" | jq -r '.data.domain // "unknown"')
  echo "$id  $domain"
done
```

## Content Truncation

Log entries truncate large content to keep files manageable:
- User messages: first 500 chars + `full_length` field
- Agent responses: first 500 chars + `full_length` field
- Tool inputs: first 500 chars of JSON + `input_length` field
- Tool outputs: first 500 chars + `output_length` field
- Error stacks: first 1000 chars

To see full content, use the `full_length` / `output_length` fields to know whether truncation occurred, then inspect the conversation or offloaded files directly.
