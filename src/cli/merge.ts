import fs from "node:fs/promises";

import { resolveProjectFromCwd } from "../core/project.js";
import { mergeTraces } from "../merge/orchestrator.js";
import { CliError, printJson } from "./shared.js";

export interface MergeCommandOptions {
  trace?: string[];
  tracesFile?: string;
  note?: string;
}

export async function runMergeCommand(options: MergeCommandOptions): Promise<void> {
  const project = await resolveProjectFromCwd(process.cwd());
  if (!project) {
    throw new CliError(
      "SETUP_REQUIRED",
      "No Autotune project found for the current directory. Run autotune init first.",
      5,
    );
  }

  let traceIds = options.trace ?? [];
  if (options.tracesFile) {
    const content = await fs.readFile(options.tracesFile, "utf8");
    const parsed = JSON.parse(content) as { traces?: string[]; merge?: { note?: string } };
    traceIds = parsed.traces ?? traceIds;
    if (!options.note && parsed.merge?.note) {
      options.note = parsed.merge.note;
    }
  }

  if (traceIds.length === 0) {
    throw new CliError("INVALID_ARGS", "merge requires at least one --trace or --traces-file.", 2);
  }

  let result;
  try {
    result = await mergeTraces(
      options.note
        ? {
            project,
            traceIds,
            note: options.note,
          }
        : {
            project,
            traceIds,
          },
    );
  } catch (error) {
    throw new CliError(
      "MERGE_FAILED",
      error instanceof Error ? error.message : "Merge failed.",
      6,
    );
  }

  printJson({
    ok: true,
    mergedTraceId: result.mergedTraceId,
    sourceTraceIds: result.sourceTraceIds,
    backend: "pi",
    storedPath: result.storedPath,
  });
}
