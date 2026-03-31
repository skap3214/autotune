import fs from "node:fs/promises";
import path from "node:path";

import { type RegistryEntry } from "../core/config.js";
import { readProjectIndex, updateProjectIndex } from "../core/index.js";
import { createTraceId } from "../core/trace-id.js";
import { createCustomEntry, createSessionHeader, stringifyJsonl, type PiSessionLine } from "../format/pi-session.js";
import { buildMergePrompt } from "./prompt.js";
import { runPiMerge } from "./pi-backend.js";

async function readTraceLines(project: RegistryEntry, traceId: string): Promise<PiSessionLine[]> {
  const filePath = path.join(project.storePath, "traces", `${traceId}.jsonl`);
  const content = await fs.readFile(filePath, "utf8");
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as PiSessionLine);
}

function nextMergedLines(
  mergedTraceId: string,
  cwd: string,
  piLines: PiSessionLine[],
  sourceTraceIds: string[],
): PiSessionLine[] {
  const nonHeaderLines = piLines.filter((line) => line.type !== "session");
  return [
    createSessionHeader({ sessionId: mergedTraceId, cwd }),
    createCustomEntry({
      customType: "autotune/derivation",
      value: {
        derivationType: sourceTraceIds.length > 1 ? "merged" : "idealized",
        backend: "pi",
        sourceTraceIds,
      },
    }),
    createCustomEntry({
      customType: "autotune/source_sessions",
      value: sourceTraceIds,
    }),
    ...nonHeaderLines,
  ];
}

export interface MergeResult {
  mergedTraceId: string;
  storedPath: string;
  sourceTraceIds: string[];
}

export async function mergeTraces(input: {
  project: RegistryEntry;
  traceIds: string[];
  note?: string;
}): Promise<MergeResult> {
  const index = await readProjectIndex(input.project.storePath);
  const traces = await Promise.all(
    input.traceIds.map(async (traceId) => {
      const entry = index.sessions[traceId];
      if (!entry) {
        throw new Error(`Trace ${traceId} does not exist in this project.`);
      }

      return {
        traceId,
        indexEntry: entry,
        lines: await readTraceLines(input.project, traceId),
      };
    }),
  );

  const prompt = buildMergePrompt(
    input.note
      ? { traces, note: input.note }
      : { traces },
  );
  const piLines = await runPiMerge(prompt);
  const mergedTraceId = createTraceId();
  const mergedLines = nextMergedLines(mergedTraceId, input.project.cwd, piLines, input.traceIds);
  const storedPath = path.join(input.project.storePath, "traces", `${mergedTraceId}.jsonl`);

  await fs.writeFile(storedPath, stringifyJsonl(mergedLines), "utf8");

  await updateProjectIndex(input.project.storePath, async (currentIndex) => {
    currentIndex.sessions[mergedTraceId] = {
      harness: null,
      provider: null,
      model: null,
      sessionId: null,
      resolution: "merge:pi",
      confidence: "high",
      outcome: null,
      goal: null,
      reason: null,
      note: input.note ?? null,
      metadata: null,
      kind: "merged",
      filePath: path.relative(input.project.storePath, storedPath),
      createdAt: new Date().toISOString(),
    };

    for (const traceId of input.traceIds) {
      currentIndex.links.push({
        sourceId: traceId,
        targetId: mergedTraceId,
        linkType: "merged_into",
        createdAt: new Date().toISOString(),
      });
    }
  });

  return {
    mergedTraceId,
    storedPath,
    sourceTraceIds: input.traceIds,
  };
}
