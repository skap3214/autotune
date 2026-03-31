import type { SessionIndexEntry } from "../core/config.js";
import type { PiSessionLine } from "../format/pi-session.js";

function summarizeLines(lines: PiSessionLine[]): string {
  return lines
    .map((line) => JSON.stringify(line))
    .join("\n");
}

export interface MergePromptInput {
  traces: Array<{
    traceId: string;
    indexEntry: SessionIndexEntry;
    lines: PiSessionLine[];
  }>;
  note?: string;
}

export function buildMergePrompt(input: MergePromptInput): string {
  const intro = [
    "You are merging one or more captured coding-agent traces into a single idealized trace.",
    "Return only newline-delimited JSON objects.",
    "The first line must be a session header with type=session.",
    "Subsequent lines must be message or custom entries.",
    "If you reconstruct or infer a step, emit a custom entry with customType=autotune/annotation and value.synthetic=true.",
    "Do not wrap the response in markdown fences.",
  ].join("\n");

  const traceBlocks = input.traces
    .map(
      (trace, index) => `## Source Trace ${index + 1}
traceId: ${trace.traceId}
harness: ${trace.indexEntry.harness}
outcome: ${trace.indexEntry.outcome}
goal: ${trace.indexEntry.goal}
reason: ${trace.indexEntry.reason}
note: ${trace.indexEntry.note}

${summarizeLines(trace.lines)}`,
    )
    .join("\n\n");

  const mergeMode =
    input.traces.length === 1
      ? "Create an idealized cleaned-up version of the single source trace."
      : "Merge the sources into the most coherent idealized trajectory.";

  const note = input.note ? `Merge note: ${input.note}` : "";

  return `${intro}

${mergeMode}
${note}

${traceBlocks}
`;
}
