import type { SessionIndexEntry } from "../core/config.js";
import type { PiCustomEntry, PiMessageEntry, PiSessionLine } from "../format/pi-session.js";
import type { ProviderMetadataValue, TraceMetadataValue } from "../format/custom-entries.js";

export type ExportFormat = "sessions" | "sft-jsonl" | "chatml";

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
    const traceMeta = extractTraceMeta(payload.lines);
    const providerMeta = extractProviderMeta(payload.lines);

    const parts: string[] = [];

    // System message from metadata.
    const systemParts: string[] = [];
    if (providerMeta?.harness) systemParts.push(`Harness: ${providerMeta.harness}`);
    if (traceMeta?.goal) systemParts.push(`Goal: ${traceMeta.goal}`);
    if (systemParts.length > 0) {
      parts.push(`<|im_start|>system\n${systemParts.join("\n")}<|im_end|>`);
    }

    // Messages + inline tool calls/results.
    const allLines = payload.lines;
    for (const line of allLines) {
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
