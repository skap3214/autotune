import type { SessionIndexEntry } from "../core/config.js";
import type { PiCustomEntry, PiMessageEntry, PiSessionLine } from "../format/pi-session.js";
import type { ProviderMetadataValue, TraceMetadataValue } from "../format/custom-entries.js";

export type ExportFormat = "sessions" | "sharegpt" | "sft-jsonl" | "chatml" | "canonical";

export interface TraceExportPayload {
  traceId: string;
  indexEntry: SessionIndexEntry;
  lines: PiSessionLine[];
}

function messageLines(lines: PiSessionLine[]): PiMessageEntry[] {
  return lines.filter((l): l is PiMessageEntry => l.type === "message");
}

function customEntriesOfType(lines: PiSessionLine[], customType: string): PiCustomEntry[] {
  return lines.filter(
    (l): l is PiCustomEntry => l.type === "custom" && l.customType === customType,
  );
}

function extractProviderMeta(lines: PiSessionLine[]): ProviderMetadataValue | null {
  const entries = customEntriesOfType(lines, "autotune/provider_metadata");
  return entries.length > 0 ? (entries[0]!.value as ProviderMetadataValue) : null;
}

function extractTraceMeta(lines: PiSessionLine[]): TraceMetadataValue | null {
  const entries = customEntriesOfType(lines, "autotune/trace_metadata");
  return entries.length > 0 ? (entries[0]!.value as TraceMetadataValue) : null;
}

// ---------------------------------------------------------------------------
// sessions format — raw JSONL passthrough
// ---------------------------------------------------------------------------

export function formatSessions(payloads: TraceExportPayload[]): string {
  const blocks = payloads.map((payload) =>
    payload.lines.map((line) => JSON.stringify(line)).join("\n"),
  );
  return `${blocks.join("\n\n")}\n`;
}

// ---------------------------------------------------------------------------
// sft-jsonl — one JSON object per trace
// ---------------------------------------------------------------------------

export function formatSftJsonl(payloads: TraceExportPayload[]): string {
  const lines = payloads.map((payload) => {
    const providerMeta = extractProviderMeta(payload.lines);
    const traceMeta = extractTraceMeta(payload.lines);
    const messages = messageLines(payload.lines).map((m) => ({
      role: m.role,
      content: m.text,
    }));
    const toolCalls = customEntriesOfType(payload.lines, "autotune/tool_call").map((e) => e.value);
    const toolResults = customEntriesOfType(payload.lines, "autotune/tool_result").map(
      (e) => e.value,
    );

    return JSON.stringify({
      id: payload.traceId,
      source: providerMeta?.harness ?? payload.indexEntry.harness,
      model: providerMeta?.model ?? payload.indexEntry.model,
      outcome: traceMeta?.outcome ?? payload.indexEntry.outcome,
      goal: traceMeta?.goal ?? payload.indexEntry.goal,
      messages,
      ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      ...(toolResults.length > 0 ? { tool_results: toolResults } : {}),
      created_at: payload.indexEntry.createdAt,
    });
  });

  return `${lines.join("\n")}\n`;
}

// ---------------------------------------------------------------------------
// chatml — ChatML-tagged text
// ---------------------------------------------------------------------------

export function formatChatMl(payloads: TraceExportPayload[]): string {
  const blocks = payloads.map((payload) => {
    const parts: string[] = [];

    for (const line of payload.lines) {
      if (line.type === "message") {
        parts.push(`<|im_start|>${line.role}\n${line.text}<|im_end|>`);
      }

      if (line.type === "custom" && line.customType === "autotune/tool_call") {
        const val = line.value as Record<string, unknown>;
        const name = String(val.tool ?? "unknown");
        const input = val.input ? JSON.stringify(val.input) : "";
        parts.push(`<|im_start|>assistant\n[TOOL_CALL: ${name}]\n${input}<|im_end|>`);
      }

      if (line.type === "custom" && line.customType === "autotune/tool_result") {
        const val = line.value as Record<string, unknown>;
        const name = String(val.tool ?? "unknown");
        const output = typeof val.output === "string" ? val.output : JSON.stringify(val.output);
        parts.push(`<|im_start|>user\n[TOOL_RESULT: ${name}]\n${output}<|im_end|>`);
      }
    }

    return parts.join("\n");
  });

  return `${blocks.join("\n---\n")}\n`;
}

// ---------------------------------------------------------------------------
// sharegpt — ShareGPT JSONL for Unsloth / Axolotl
// ---------------------------------------------------------------------------

const ROLE_TO_SHAREGPT: Record<string, string> = {
  user: "human",
  assistant: "gpt",
  system: "system",
};

export function formatShareGpt(payloads: TraceExportPayload[]): string {
  const lines = payloads.map((payload) => {
    const conversations: Array<{ from: string; value: string }> = [];

    for (const line of payload.lines) {
      if (line.type === "message") {
        conversations.push({
          from: ROLE_TO_SHAREGPT[line.role] ?? line.role,
          value: line.text,
        });
      }

      if (line.type === "custom" && line.customType === "autotune/tool_call") {
        const val = line.value as Record<string, unknown>;
        const name = String(val.tool ?? "unknown");
        const input = val.input ? JSON.stringify(val.input) : "";
        conversations.push({ from: "function_call", value: `${name}\n${input}` });
      }

      if (line.type === "custom" && line.customType === "autotune/tool_result") {
        const val = line.value as Record<string, unknown>;
        const output = typeof val.output === "string" ? val.output : JSON.stringify(val.output);
        conversations.push({ from: "observation", value: output });
      }
    }

    return JSON.stringify({ conversations });
  });

  return `${lines.join("\n")}\n`;
}

// ---------------------------------------------------------------------------
// canonical — pi-brain compatible CanonicalSession
// ---------------------------------------------------------------------------

export function formatCanonical(payloads: TraceExportPayload[]): string {
  const lines = payloads.map((payload) => {
    const providerMeta = extractProviderMeta(payload.lines);
    const traceMeta = extractTraceMeta(payload.lines);
    const header = payload.lines.find((l) => l.type === "session") as
      | { cwd?: string; timestamp?: string }
      | undefined;

    const messages: Array<{
      role: string;
      content: string;
      timestamp?: string;
      model?: string;
      toolName?: string;
      toolCallId?: string;
    }> = [];

    for (const line of payload.lines) {
      if (line.type === "message") {
        messages.push({
          role: line.role,
          content: line.text,
          timestamp: line.timestamp,
        });
      }

      if (line.type === "custom" && line.customType === "autotune/tool_call") {
        const val = line.value as Record<string, unknown>;
        const callId = typeof val.callId === "string" ? val.callId : null;
        messages.push({
          role: "assistant",
          content: `[Tool call: ${String(val.tool ?? "unknown")}] ${typeof val.input === "string" ? val.input : JSON.stringify(val.input ?? "")}`,
          timestamp: line.timestamp,
          toolName: String(val.tool ?? "unknown"),
          ...(callId ? { toolCallId: callId } : {}),
        });
      }

      if (line.type === "custom" && line.customType === "autotune/tool_result") {
        const val = line.value as Record<string, unknown>;
        const toolName = typeof val.tool === "string" ? val.tool : null;
        const callId = typeof val.callId === "string" ? val.callId : null;
        messages.push({
          role: "tool-result",
          content: typeof val.output === "string" ? val.output : JSON.stringify(val.output ?? ""),
          timestamp: line.timestamp,
          ...(toolName ? { toolName } : {}),
          ...(callId ? { toolCallId: callId } : {}),
        });
      }
    }

    return JSON.stringify({
      id: payload.traceId,
      source: providerMeta?.harness ?? payload.indexEntry.harness,
      messages,
      projectPath: header?.cwd,
      name: traceMeta?.goal,
      createdAt: payload.indexEntry.createdAt,
      metadata: {
        model: providerMeta?.model ?? payload.indexEntry.model,
        provider: providerMeta?.provider ?? payload.indexEntry.provider,
        outcome: traceMeta?.outcome ?? payload.indexEntry.outcome,
        reason: traceMeta?.reason ?? payload.indexEntry.reason,
      },
    });
  });

  return `${lines.join("\n")}\n`;
}
