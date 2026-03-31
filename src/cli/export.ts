import fs from "node:fs/promises";
import path from "node:path";

import { resolveProjectFromCwd } from "../core/project.js";
import { readProjectIndex } from "../core/index.js";
import { loadTraceLines, resolveTraceIds } from "../export/loader.js";
import { createRedactor, type RedactionManifest } from "../export/redactor.js";
import {
  formatSessions,
  formatSftJsonl,
  formatChatMl,
  type ExportFormat,
  type TraceExportPayload,
} from "../export/formatters.js";
import { CliError, printJson } from "./shared.js";

export interface ExportCommandOptions {
  trace?: string[];
  format?: string;
  output?: string;
  redact?: boolean; // commander inverts --no-redact to redact=false
  kind?: string;
}

const VALID_FORMATS = new Set<string>(["sessions", "sft-jsonl", "chatml"]);

export async function runExportCommand(options: ExportCommandOptions): Promise<void> {
  const project = await resolveProjectFromCwd(process.cwd());
  if (!project) {
    throw new CliError(
      "SETUP_REQUIRED",
      "No Autotune project found for the current directory. Run autotune init first.",
      5,
    );
  }

  const format = (options.format ?? "sessions") as ExportFormat;
  if (!VALID_FORMATS.has(format)) {
    throw new CliError(
      "INVALID_ARGS",
      `Unknown export format "${format}". Valid: sessions, sft-jsonl, chatml`,
      2,
    );
  }

  const index = await readProjectIndex(project.storePath);
  let traceIds: string[];
  try {
    traceIds = resolveTraceIds(index, { trace: options.trace, kind: options.kind });
  } catch (error) {
    throw new CliError(
      "INVALID_ARGS",
      error instanceof Error ? error.message : "Invalid trace selection.",
      2,
    );
  }

  if (traceIds.length === 0) {
    throw new CliError("INVALID_ARGS", "No traces found matching the selection.", 2);
  }

  const shouldRedact = options.redact !== false;
  const payloads: TraceExportPayload[] = [];
  const manifests: RedactionManifest[] = [];

  for (const traceId of traceIds) {
    const entry = index.sessions[traceId];
    if (!entry) continue;

    let lines = await loadTraceLines(project.storePath, entry.filePath);

    if (shouldRedact) {
      const redactor = createRedactor(traceId);
      const result = redactor.redact(lines);
      lines = result.lines;
      manifests.push(result.manifest);
    }

    payloads.push({ traceId, indexEntry: entry, lines });
  }

  let output: string;
  switch (format) {
    case "sessions":
      output = formatSessions(payloads);
      break;
    case "sft-jsonl":
      output = formatSftJsonl(payloads);
      break;
    case "chatml":
      output = formatChatMl(payloads);
      break;
  }

  const totalRedactions = manifests.reduce((sum, m) => sum + m.count, 0);

  if (options.output) {
    const outputPath = path.resolve(options.output);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, output, "utf8");

    printJson({
      ok: true,
      format,
      traceCount: payloads.length,
      outputPath,
      redaction: shouldRedact
        ? { enabled: true, totalRedactions, manifests }
        : { enabled: false },
    });
  } else {
    // Data to stdout, summary to stderr.
    process.stdout.write(output);
    process.stderr.write(
      `${JSON.stringify({
        ok: true,
        format,
        traceCount: payloads.length,
        redaction: shouldRedact
          ? { enabled: true, totalRedactions }
          : { enabled: false },
      })}\n`,
    );
  }
}
