import type { HarnessName } from "../core/config.js";
import { createCustomEntry, createMessageEntry, type PiCustomEntry, type PiMessageEntry, type PiSessionLine } from "./pi-session.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textFromMessageContent(content: unknown): string | null {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    const chunks = content
      .map((item) => {
        if (isRecord(item)) {
          if (typeof item.text === "string") {
            return item.text;
          }
          if (item.type === "output_text" && typeof item.text === "string") {
            return item.text;
          }
          if (item.type === "input_text" && typeof item.text === "string") {
            return item.text;
          }
        }
        return null;
      })
      .filter((item): item is string => Boolean(item));

    return chunks.length > 0 ? chunks.join("\n") : null;
  }

  if (isRecord(content)) {
    if (typeof content.text === "string") {
      return content.text;
    }
    if (Array.isArray(content.items)) {
      return textFromMessageContent(content.items);
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Codex normalizer
// ---------------------------------------------------------------------------

function normalizeCodexEvent(event: unknown): PiSessionLine[] {
  if (!isRecord(event)) {
    return [];
  }

  const lines: PiSessionLine[] = [];

  // turn_context carries per-turn model info — skip as a message but the
  // caller can extract model from it separately.

  if (event.type === "event_msg" && isRecord(event.payload)) {
    if (event.payload.type === "user_message" && typeof event.payload.message === "string") {
      lines.push(createMessageEntry({ role: "user", text: event.payload.message }));
    }

    if (event.payload.type === "agent_message" && typeof event.payload.message === "string") {
      lines.push(createMessageEntry({ role: "assistant", text: event.payload.message }));
    }
  }

  if (event.type === "response_item" && isRecord(event.payload)) {
    if (event.payload.type === "message") {
      const role = event.payload.role;
      const text = textFromMessageContent(event.payload.content);
      if ((role === "user" || role === "assistant" || role === "system") && text) {
        lines.push(createMessageEntry({ role, text }));
      }
    }

    if (event.payload.type === "function_call") {
      lines.push(
        createCustomEntry({
          customType: "autotune/tool_call",
          value: {
            tool: String(event.payload.name ?? "unknown"),
            input: event.payload.arguments ?? null,
            callId: event.payload.call_id ?? null,
          },
        }),
      );
    }

    if (event.payload.type === "function_call_output") {
      lines.push(
        createCustomEntry({
          customType: "autotune/tool_result",
          value: {
            tool: String(event.payload.call_id ?? "unknown"),
            output: event.payload.output ?? null,
            callId: event.payload.call_id ?? null,
          },
        }),
      );
    }
  }

  if (event.type === "local_shell_call" && isRecord(event.action)) {
    lines.push(
      createCustomEntry({
        customType: "autotune/tool_call",
        value: {
          tool: "bash",
          input: {
            command: event.action.command ?? null,
            workingDirectory: event.action.working_directory ?? null,
            env: event.action.env ?? {},
            status: event.status ?? null,
          },
        },
      }),
    );
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Claude Code normalizer
// ---------------------------------------------------------------------------

/** Entry types that carry conversation messages. */
const CLAUDE_MESSAGE_TYPES = new Set(["user", "assistant"]);

/** Entry types to skip — not conversation content. */
const CLAUDE_SKIP_TYPES = new Set([
  "progress",
  "file-history-snapshot",
  "queue-operation",
  "last-prompt",
  "system",
]);

interface ClaudeContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  name?: string;
  id?: string;
  input?: Record<string, unknown>;
}

function normalizeClaudeEvent(event: unknown): PiSessionLine[] {
  if (!isRecord(event)) {
    return [];
  }

  const lines: PiSessionLine[] = [];
  const entryType = event.type as string | undefined;

  if (!entryType || CLAUDE_SKIP_TYPES.has(entryType)) {
    return [];
  }

  if (!CLAUDE_MESSAGE_TYPES.has(entryType)) {
    // Unknown type — preserve as raw provider event.
    lines.push(
      createCustomEntry({
        customType: "autotune/provider_event",
        value: event,
      }),
    );
    return lines;
  }

  const msg = isRecord(event.message) ? event.message : null;
  if (!msg) {
    return [];
  }

  if (entryType === "user") {
    const content = typeof msg.content === "string" ? msg.content : "";
    if (content) {
      lines.push(createMessageEntry({ role: "user", text: content }));
    }
    return lines;
  }

  // Assistant messages: content is an array of blocks.
  const contentArr = msg.content;
  if (Array.isArray(contentArr)) {
    const textParts: string[] = [];
    for (const block of contentArr as ClaudeContentBlock[]) {
      if (block.type === "text" && block.text) {
        textParts.push(block.text);
      }

      if (block.type === "tool_use" && block.name) {
        lines.push(
          createCustomEntry({
            customType: "autotune/tool_call",
            value: {
              tool: block.name,
              input: block.input ?? null,
              callId: block.id ?? null,
            },
          }),
        );
      }

      if (block.type === "tool_result") {
        const resultText = typeof block.text === "string" ? block.text : null;
        if (resultText) {
          lines.push(
            createCustomEntry({
              customType: "autotune/tool_result",
              value: {
                tool: block.name ?? "unknown",
                output: resultText,
                callId: block.id ?? null,
              },
            }),
          );
        }
      }
    }

    const assistantText = textParts.join("\n");
    if (assistantText) {
      lines.push(
        createMessageEntry({
          role: "assistant",
          text: assistantText,
        }),
      );
    }
  } else if (typeof contentArr === "string" && contentArr) {
    lines.push(createMessageEntry({ role: "assistant", text: contentArr }));
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Hermes normalizer
// ---------------------------------------------------------------------------

interface HermesToolCallData {
  id?: string;
  call_id?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

function normalizeHermesEvent(event: unknown): PiSessionLine[] {
  if (!isRecord(event)) {
    return [];
  }

  const lines: PiSessionLine[] = [];
  const role = event.role as string | undefined;

  if (role === "user" && typeof event.content === "string" && event.content) {
    lines.push(createMessageEntry({ role: "user", text: event.content }));
    return lines;
  }

  if (role === "assistant") {
    const content = typeof event.content === "string" ? event.content.trim() : "";
    if (content) {
      lines.push(createMessageEntry({ role: "assistant", text: content }));
    }

    // Assistant messages may include tool_calls.
    const toolCalls = event.tool_calls;
    if (typeof toolCalls === "string") {
      try {
        const parsed = JSON.parse(toolCalls) as HermesToolCallData[];
        if (Array.isArray(parsed)) {
          for (const call of parsed) {
            const toolName = call.function?.name;
            if (toolName) {
              lines.push(
                createCustomEntry({
                  customType: "autotune/tool_call",
                  value: {
                    tool: toolName,
                    input: call.function?.arguments ?? null,
                    callId: call.call_id ?? call.id ?? null,
                  },
                }),
              );
            }
          }
        }
      } catch {
        // tool_calls wasn't valid JSON — skip.
      }
    }

    return lines;
  }

  if (role === "tool") {
    let output = typeof event.content === "string" ? event.content : "";
    // Hermes tool content is often JSON with an output field.
    if (output) {
      try {
        const parsed = JSON.parse(output) as Record<string, unknown>;
        if (typeof parsed.output === "string") {
          output = parsed.output;
        } else if (typeof parsed.content === "string") {
          output = parsed.content;
        }
      } catch {
        // Not JSON — use raw content.
      }
    }

    if (output) {
      lines.push(
        createCustomEntry({
          customType: "autotune/tool_result",
          value: {
            tool: (event.tool_name as string) ?? "unknown",
            output,
            callId: (event.tool_call_id as string) ?? null,
          },
        }),
      );
    }

    return lines;
  }

  // system or unknown role — skip.
  return lines;
}

// ---------------------------------------------------------------------------
// OpenCode normalizer
// ---------------------------------------------------------------------------

interface OpenCodePartData {
  type: string;
  text?: string;
  tool?: string;
  callID?: string;
  state?: {
    status?: string;
    input?: Record<string, unknown>;
    output?: string;
    title?: string;
  };
}

function normalizeOpenCodeEvent(event: unknown): PiSessionLine[] {
  if (!isRecord(event)) {
    return [];
  }

  const lines: PiSessionLine[] = [];
  const role = event.role as string | undefined;

  // If the event has a parts array (enriched from DB), process those.
  if (Array.isArray(event.parts)) {
    const textParts: string[] = [];
    for (const part of event.parts as unknown[]) {
      if (!isRecord(part)) continue;
      const pd = part as unknown as OpenCodePartData;

      if (pd.type === "text" && pd.text) {
        textParts.push(pd.text);
      }

      if (pd.type === "tool" && pd.tool && pd.state?.output) {
        lines.push(
          createCustomEntry({
            customType: "autotune/tool_call",
            value: {
              tool: pd.tool,
              input: pd.state.input ?? null,
              callId: pd.callID ?? null,
              status: pd.state.status ?? null,
              title: pd.state.title ?? null,
            },
          }),
        );
        lines.push(
          createCustomEntry({
            customType: "autotune/tool_result",
            value: {
              tool: pd.tool,
              output: pd.state.output,
              callId: pd.callID ?? null,
            },
          }),
        );
      }
    }

    const text = textParts.join("\n");
    if (text && (role === "user" || role === "assistant")) {
      lines.push(createMessageEntry({ role, text }));
    }

    if (lines.length > 0) {
      return lines;
    }
  }

  // Fallback: simple message without parts.
  const directText =
    (typeof event.content === "string" && event.content) ||
    (typeof event.text === "string" && event.text) ||
    textFromMessageContent(event.content) ||
    null;

  if ((role === "user" || role === "assistant") && directText) {
    lines.push(createMessageEntry({ role, text: directText }));
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Generic fallback normalizer
// ---------------------------------------------------------------------------

function normalizeGenericEvent(event: unknown): PiSessionLine[] {
  if (!isRecord(event)) {
    return [];
  }

  const lines: PiSessionLine[] = [];

  const role = event.role;
  const directText =
    (typeof event.content === "string" && event.content) ||
    (typeof event.text === "string" && event.text) ||
    textFromMessageContent(event.content) ||
    null;

  if ((role === "user" || role === "assistant" || role === "system") && directText) {
    lines.push(createMessageEntry({ role, text: directText }));
  }

  if (isRecord(event.payload)) {
    const payloadText = textFromMessageContent(event.payload.content) ?? null;
    if (
      (event.payload.role === "user" ||
        event.payload.role === "assistant" ||
        event.payload.role === "system") &&
      payloadText
    ) {
      lines.push(createMessageEntry({ role: event.payload.role, text: payloadText }));
    }
  }

  if (lines.length === 0) {
    lines.push(
      createCustomEntry({
        customType: "autotune/provider_event",
        value: event,
      }),
    );
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function normalizeProviderEvents(harness: HarnessName, events: unknown[]): PiSessionLine[] {
  const lines: PiSessionLine[] = [];

  for (const event of events) {
    switch (harness) {
      case "codex":
        lines.push(...normalizeCodexEvent(event));
        break;
      case "claude-code":
        lines.push(...normalizeClaudeEvent(event));
        break;
      case "hermes":
        lines.push(...normalizeHermesEvent(event));
        break;
      case "opencode":
        lines.push(...normalizeOpenCodeEvent(event));
        break;
      default:
        lines.push(...normalizeGenericEvent(event));
    }
  }

  return lines;
}

export function ensureMeaningfulLines(lines: PiSessionLine[], rawEvents: unknown[]): PiSessionLine[] {
  if (lines.length > 0) {
    return lines;
  }

  return [
    createCustomEntry({
      customType: "autotune/provider_event",
      value: rawEvents,
    }),
  ];
}

export function toCustomEntries(lines: PiSessionLine[]): PiCustomEntry[] {
  return lines.filter((line): line is PiCustomEntry => line.type === "custom");
}

export function toMessageEntries(lines: PiSessionLine[]): PiMessageEntry[] {
  return lines.filter((line): line is PiMessageEntry => line.type === "message");
}

// ---------------------------------------------------------------------------
// Metadata extractors (used by adapters for model/provider info)
// ---------------------------------------------------------------------------

export function extractCodexMeta(events: unknown[]): {
  sessionId: string | null;
  provider: string | null;
  model: string | null;
  cwd: string | null;
} {
  let sessionId: string | null = null;
  let provider: string | null = null;
  let model: string | null = null;
  let cwd: string | null = null;

  for (const event of events) {
    if (!isRecord(event)) continue;

    if (event.type === "session_meta" && isRecord(event.payload)) {
      const payload = event.payload;
      sessionId = typeof payload.id === "string" ? payload.id : sessionId;
      provider = typeof payload.model_provider === "string" ? payload.model_provider : provider;
      model = typeof payload.model === "string" ? payload.model : model;
      cwd = typeof payload.cwd === "string" ? payload.cwd : cwd;
    }

    // turn_context carries per-turn model updates.
    if (event.type === "turn_context" && isRecord(event.payload)) {
      const payload = event.payload;
      if (typeof payload.model === "string") model = payload.model;
      if (typeof payload.cwd === "string") cwd = payload.cwd;
    }
  }

  return { sessionId, provider, model, cwd };
}

export function extractClaudeMeta(events: unknown[]): {
  sessionId: string | null;
  model: string | null;
  cwd: string | null;
} {
  let sessionId: string | null = null;
  let model: string | null = null;
  let cwd: string | null = null;

  for (const event of events) {
    if (!isRecord(event)) continue;
    if (typeof event.sessionId === "string" && !sessionId) sessionId = event.sessionId;
    if (typeof event.cwd === "string" && !cwd) cwd = event.cwd;
    if (isRecord(event.message) && typeof event.message.model === "string" && !model) {
      model = event.message.model;
    }
  }

  return { sessionId, model, cwd };
}

export function extractHermesMeta(events: unknown[]): {
  model: string | null;
} {
  // Hermes session JSON has model at the top level.
  if (events.length === 1 && isRecord(events[0])) {
    const session = events[0];
    if (typeof session.model === "string") {
      return { model: session.model };
    }
  }

  // If events are individual messages, scan for model in assistant messages.
  for (const event of events) {
    if (!isRecord(event)) continue;
    if (event.role === "assistant" && typeof event.model === "string") {
      return { model: event.model };
    }
  }

  return { model: null };
}

export function extractOpenCodeMeta(events: unknown[]): {
  model: string | null;
  provider: string | null;
} {
  let model: string | null = null;
  let provider: string | null = null;

  for (const event of events) {
    if (!isRecord(event)) continue;
    if (typeof event.modelID === "string") model = event.modelID;
    if (typeof event.providerID === "string") provider = event.providerID;
    if (isRecord(event.model)) {
      if (typeof event.model.modelID === "string") model = event.model.modelID as string;
      if (typeof event.model.providerID === "string") provider = event.model.providerID as string;
    }
    if (model) break;
  }

  return { model, provider };
}
