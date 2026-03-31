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

function normalizeCodexEvent(event: unknown): PiSessionLine[] {
  if (!isRecord(event)) {
    return [];
  }

  const lines: PiSessionLine[] = [];

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

export function normalizeProviderEvents(harness: HarnessName, events: unknown[]): PiSessionLine[] {
  const lines: PiSessionLine[] = [];

  for (const event of events) {
    if (harness === "codex") {
      lines.push(...normalizeCodexEvent(event));
      continue;
    }

    lines.push(...normalizeGenericEvent(event));
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
