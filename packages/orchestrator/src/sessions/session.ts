import Anthropic from "@anthropic-ai/sdk";
import {
  type Message,
  type SessionToolUsePayload,
  type SessionToolResultPayload,
  createMessage,
} from "@browser-experiment/shared";
import type { ToolRegistry } from "../tools/registry.js";
import type { SessionLogger } from "../logging/session-logger.js";

type SendFn = (msg: Message) => void;

const MODEL = "claude-opus-4-6";
const MAX_TOKENS = 8192;

interface ConversationMessage {
  role: "user" | "assistant";
  content: string | Anthropic.ContentBlock[];
}

const MAX_CONVERSATION_CHARS = 400_000;

const IMAGE_TOKEN_ESTIMATE = 2000;
const IMAGE_CHAR_ESTIMATE = IMAGE_TOKEN_ESTIMATE * 4;

function estimateChars(content: string | Anthropic.ContentBlock[] | Anthropic.ToolResultBlockParam[]): number {
  if (typeof content === "string") return content.length;
  let total = 0;
  for (const block of content) {
    const b = block as unknown as Record<string, unknown>;
    if (b.type === "image") {
      total += IMAGE_CHAR_ESTIMATE;
    } else if ("text" in b && typeof b.text === "string") {
      total += (b.text as string).length;
    } else if ("content" in b) {
      if (typeof b.content === "string") {
        total += b.content.length;
      } else if (Array.isArray(b.content)) {
        total += estimateChars(b.content as Anthropic.ContentBlock[]);
      }
    } else if ("input" in b) {
      total += JSON.stringify(b.input).length;
    } else {
      total += JSON.stringify(b).length;
    }
  }
  return total;
}

function totalConversationChars(conversation: ConversationMessage[]): number {
  return conversation.reduce((sum, m) => sum + estimateChars(m.content as string | Anthropic.ContentBlock[]), 0);
}

function pruneToolResultBlock(block: Record<string, unknown>): Record<string, unknown> {
  if (block.type !== "tool_result") return block;
  if (Array.isArray(block.content)) {
    const textParts = (block.content as Array<Record<string, unknown>>)
      .filter((b) => b.type !== "image")
      .map((b) => (b as { text?: string }).text ?? "");
    const summary = textParts.join(" ").slice(0, 100);
    return { ...block, content: `[pruned: ${summary}]` };
  }
  if (typeof block.content === "string" && block.content.length > 200) {
    return { ...block, content: "[pruned from history]" };
  }
  return block;
}

function pruneConversation(conversation: ConversationMessage[]): void {
  // Strip images from all but the last 2 user messages (old screenshots aren't useful)
  const userMsgIndices: number[] = [];
  for (let i = 0; i < conversation.length; i++) {
    if (conversation[i].role === "user" && Array.isArray(conversation[i].content)) {
      userMsgIndices.push(i);
    }
  }
  const oldUserIndices = userMsgIndices.slice(0, -2);
  for (const idx of oldUserIndices) {
    const msg = conversation[idx];
    if (!Array.isArray(msg.content)) continue;
    const blocks = msg.content as unknown[];
    const hasImages = blocks.some((b) => {
      const block = b as Record<string, unknown>;
      return (
        block.type === "tool_result" &&
        Array.isArray(block.content) &&
        (block.content as Array<Record<string, unknown>>).some((c) => c.type === "image")
      );
    });
    if (hasImages) {
      msg.content = blocks.map((b) =>
        pruneToolResultBlock(b as Record<string, unknown>),
      ) as unknown as Anthropic.ContentBlock[];
    }
  }

  while (conversation.length > 2 && totalConversationChars(conversation) > MAX_CONVERSATION_CHARS) {
    const oldest = conversation[0];
    if (typeof oldest.content !== "string" && Array.isArray(oldest.content)) {
      const blocks = oldest.content as unknown[];
      const hasToolResults = blocks.some(
        (b) => (b as { type?: string }).type === "tool_result",
      );
      if (hasToolResults) {
        oldest.content = blocks.map((b) =>
          pruneToolResultBlock(b as Record<string, unknown>),
        ) as unknown as Anthropic.ContentBlock[];
        if (totalConversationChars(conversation) <= MAX_CONVERSATION_CHARS) return;
      }
    }
    conversation.shift();
    if (conversation.length > 0 && conversation[0].role === "assistant") {
      conversation.shift();
    }
  }
}

const BASE_SYSTEM_PROMPT = `You are a browser agent with deep access to the user's browser and host operating system.

You have access to tools that let you:
- Execute shell commands on the host OS (bash)
- Read, write, and edit files (read_file, write_file, edit_file)
- Interact with the user's browser (browser) - take screenshots, inject scripts/styles, read the DOM, capture console/network logs, navigate

Use these tools to help the user customize and control their browsing experience. You can create persistent scripts and styles that modify websites, fix annoying behaviors, add accessibility features, or automate repetitive tasks.

When you create scripts or styles for a website, save them to the domain's workspace directory so they persist across visits.

Be concise and action-oriented. Prefer showing results over explaining what you plan to do.

## Large tool results

Tool outputs over ~10KB are automatically saved to a file on disk. You will receive the file path, size, and a short preview. Do NOT read these files into context with read_file -- that defeats the purpose of offloading. Instead, use targeted commands to extract only what you need:

### Searching offloaded files

Use bash with standard tools to search without loading the whole file:

- \`grep -n "pattern" /tmp/.../file.txt\` -- find lines matching a pattern
- \`grep -C 3 "pattern" /tmp/.../file.txt\` -- with context lines
- \`head -n 50 /tmp/.../file.txt\` -- first 50 lines
- \`tail -n 50 /tmp/.../file.txt\` -- last 50 lines
- \`wc -l /tmp/.../file.txt\` -- line count
- \`sed -n '100,150p' /tmp/.../file.txt\` -- specific line range
- \`grep -c "pattern" /tmp/.../file.txt\` -- count matches

### Scripted analysis for complex cases

When you need structured extraction from a large result (HTML, JSON, logs), write a Python script and run it via bash. This is preferred when:
- The search criteria are deterministic (known selectors, keys, patterns)
- You need to parse structured data (HTML, JSON, CSV)
- You need to aggregate or transform data (counts, sums, filtering)

Example: extracting data from a large DOM dump:
\`\`\`
python3 -c "
from html.parser import HTMLParser
# ... parse and extract only what's needed
"
\`\`\`

Or write to a temp file first for multi-step scripts:
\`\`\`
python3 /tmp/analyze.py /tmp/.../read_dom-1234.txt
\`\`\`

IMPORTANT: Always prefer targeted extraction over reading full files. If you can express what you're looking for as a grep pattern, CSS selector, or JSON path, do that instead of loading the entire result.

## Screenshots

The browser screenshot command captures the visible tab and attaches the image directly to the conversation -- you can see it. Screenshots are rate-limited to one every 5 seconds. Each screenshot costs ~2K tokens, so use them deliberately:
- Take ONE screenshot after visual changes to verify the result
- Do NOT take multiple screenshots in a row hoping for different results
- Do NOT try to read screenshot files via bash (base64, cat, etc.) -- the image is already visible to you
- For gathering data, prefer \`inject_script\` or \`read_dom\` over screenshots

## Gathering page information efficiently

Before reaching for read_dom on a broad selector (like "body" or "html"), consider using inject_script to extract just the data you need directly in the page context. For example:
- \`document.querySelectorAll('a').length\` instead of reading the full DOM
- \`JSON.stringify([...document.querySelectorAll('.item')].map(e => e.textContent))\` to extract text from many elements
- \`getComputedStyle(document.querySelector('.target')).display\` to check a single CSS property

This avoids generating massive DOM dumps that need to be offloaded and searched.`;

export class Session {
  private client: Anthropic;
  private conversation: ConversationMessage[] = [];
  private abortController: AbortController | null = null;
  private systemPrompt: string;

  constructor(
    public readonly id: string,
    public readonly domain: string,
    private url: string,
    private toolRegistry: ToolRegistry,
    private logger: SessionLogger,
    skillContent?: string,
  ) {
    this.client = new Anthropic();
    this.systemPrompt = skillContent
      ? `${BASE_SYSTEM_PROMPT}\n\n## Skills for ${domain}\n\n${skillContent}`
      : BASE_SYSTEM_PROMPT;

    this.logger.sessionCreated({
      domain,
      url,
      skillCount: skillContent ? skillContent.split("### ").length - 1 : 0,
      systemPromptLength: this.systemPrompt.length,
    });
  }

  async handleUserMessage(content: string, send: SendFn): Promise<void> {
    this.abortController = new AbortController();
    this.conversation.push({ role: "user", content });
    this.logger.userMessage(content);

    try {
      await this.runAgentLoop(send);
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        this.logger.debug("agent_loop_aborted");
        return;
      }
      const errorMsg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      this.logger.sessionError(errorMsg, stack);
      console.error(`[session:${this.id}] error:`, err);
      send(
        createMessage("session.error", this.id, {
          error: errorMsg,
        }),
      );
    } finally {
      this.abortController = null;
    }
  }

  cancel(): void {
    this.logger.sessionCancelled();
    this.abortController?.abort();
    this.abortController = null;
  }

  private async runAgentLoop(send: SendFn): Promise<void> {
    const tools = this.toolRegistry
      .getDefinitions()
      .map((def) => ({
        name: def.name,
        description: def.description,
        input_schema: def.input_schema as Anthropic.Tool["input_schema"],
      }));

    let turn = 0;

    while (true) {
      if (this.abortController?.signal.aborted) return;

      const charsBefore = totalConversationChars(this.conversation);
      const msgsBefore = this.conversation.length;
      pruneConversation(this.conversation);
      const charsAfter = totalConversationChars(this.conversation);
      if (this.conversation.length < msgsBefore) {
        this.logger.conversationPruned({
          removedMessages: msgsBefore - this.conversation.length,
          charsBefore,
          charsAfter,
        });
      }

      const convChars = charsAfter;
      console.log(
        `[session:${this.id}] sending ${this.conversation.length} messages (~${Math.round(convChars / 4)}tok est)`,
      );

      this.logger.apiRequest({
        model: MODEL,
        maxTokens: MAX_TOKENS,
        messageCount: this.conversation.length,
        estimatedInputChars: convChars,
        toolCount: tools.length,
      });

      let fullText = "";
      const contentBlocks: Anthropic.ContentBlock[] = [];
      const apiStart = Date.now();

      const stream = this.client.messages.stream({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: this.systemPrompt,
        messages: this.conversation.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        tools,
      });

      for await (const event of stream) {
        if (this.abortController?.signal.aborted) {
          stream.abort();
          return;
        }

        if (event.type === "content_block_delta") {
          if (event.delta.type === "text_delta") {
            fullText += event.delta.text;
            send(
              createMessage("session.chunk", this.id, {
                delta: event.delta.text,
              }),
            );
          }
        }
      }

      const finalMessage = await stream.finalMessage();
      const apiDuration = Date.now() - apiStart;
      contentBlocks.push(...finalMessage.content);

      this.logger.apiResponse({
        model: finalMessage.model,
        stopReason: finalMessage.stop_reason,
        inputTokens: finalMessage.usage.input_tokens,
        outputTokens: finalMessage.usage.output_tokens,
        durationMs: apiDuration,
      });

      this.conversation.push({
        role: "assistant",
        content: contentBlocks,
      });

      const toolUseBlocks = contentBlocks.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );

      this.logger.agentResponse(fullText, contentBlocks.length);

      if (toolUseBlocks.length === 0) {
        send(
          createMessage("session.done", this.id, { fullText }),
        );
        this.logger.debug("turn_complete", { turn, reason: "no_tool_use" });
        return;
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolBlock of toolUseBlocks) {
        const toolInput = toolBlock.input as Record<string, unknown>;

        this.logger.toolCall({
          toolId: toolBlock.id,
          toolName: toolBlock.name,
          input: toolInput,
        });

        send(
          createMessage<SessionToolUsePayload>("session.toolUse", this.id, {
            toolName: toolBlock.name,
            toolId: toolBlock.id,
            input: toolInput,
          }),
        );

        const toolStart = Date.now();
        const result = await this.toolRegistry.execute(
          toolBlock.id,
          toolBlock.name,
          toolInput,
        );
        const toolDuration = Date.now() - toolStart;

        this.logger.toolResult({
          toolId: toolBlock.id,
          toolName: toolBlock.name,
          output: result.output,
          isError: result.isError,
          durationMs: toolDuration,
          offloaded: result.output.startsWith("Output saved to: "),
        });

        send(
          createMessage<SessionToolResultPayload>(
            "session.toolResult",
            this.id,
            {
              toolId: toolBlock.id,
              output: result.output,
              isError: result.isError,
            },
          ),
        );

        if (result.image) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolBlock.id,
            content: [
              { type: "text", text: result.output },
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: result.image.mediaType,
                  data: result.image.base64,
                },
              },
            ],
            is_error: result.isError,
          });
        } else {
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolBlock.id,
            content: result.output,
            is_error: result.isError,
          });
        }
      }

      this.conversation.push({
        role: "user",
        content: toolResults as unknown as string,
      });

      turn++;
    }
  }
}
