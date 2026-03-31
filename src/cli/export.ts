import fs from "node:fs/promises";
import path from "node:path";

import { HARNESS_ADAPTERS } from "../adapters/index.js";
import type { HarnessName } from "../core/config.js";
import { resolveProjectFromCwd } from "../core/project.js";
import { readProjectIndex } from "../core/index.js";
import { loadTraceLines, resolveTraceIds } from "../export/loader.js";
import { createRedactor, type RedactionManifest } from "../export/redactor.js";
import {
  formatSessions,
  formatShareGpt,
  formatSftJsonl,
  formatChatMl,
  formatCanonical,
  type ExportFormat,
  type TraceExportPayload,
} from "../export/formatters.js";
import { normalizeProviderEvents, ensureMeaningfulLines } from "../format/normalizer.js";
import { createSessionHeader, createCustomEntry, type PiSessionLine } from "../format/pi-session.js";
import { parseUnknownTranscript, readUtf8 } from "../adapters/utils.js";
import { CliError, printJson } from "./shared.js";

export interface ExportCommandOptions {
  trace?: string[];
  harness?: string;
  format?: string;
  output?: string;
  redact?: boolean;
  kind?: string;
}

const VALID_FORMATS = new Set<string>(["sessions", "sharegpt", "sft-jsonl", "chatml", "canonical"]);

function selectFormatter(format: ExportFormat): (payloads: TraceExportPayload[]) => string {
  switch (format) {
    case "sessions": return formatSessions;
    case "sharegpt": return formatShareGpt;
    case "sft-jsonl": return formatSftJsonl;
    case "chatml": return formatChatMl;
    case "canonical": return formatCanonical;
  }
}

function writeOutput(
  output: string,
  format: ExportFormat,
  traceCount: number,
  shouldRedact: boolean,
  totalRedactions: number,
  manifests: RedactionManifest[],
  outputPath: string | null,
): void {
  if (outputPath) {
    printJson({
      ok: true,
      format,
      traceCount,
      outputPath,
      redaction: shouldRedact
        ? { enabled: true, totalRedactions, manifests }
        : { enabled: false },
    });
  } else {
    process.stdout.write(output);
    process.stderr.write(
      `${JSON.stringify({
        ok: true,
        format,
        traceCount,
        redaction: shouldRedact
          ? { enabled: true, totalRedactions }
          : { enabled: false },
      })}\n`,
    );
  }
}

// ---------------------------------------------------------------------------
// Direct harness export — reads from harness local storage without capture
// ---------------------------------------------------------------------------

async function exportFromHarness(
  harnessName: string,
  format: ExportFormat,
  shouldRedact: boolean,
  outputPath: string | null,
): Promise<void> {
  const adapter = HARNESS_ADAPTERS[harnessName as HarnessName];
  if (!adapter) {
    throw new CliError("UNSUPPORTED_COMPONENT", `Unsupported harness: ${harnessName}`, 3);
  }

  if (!adapter.listSessions) {
    throw new CliError(
      "UNSUPPORTED_COMPONENT",
      `Harness ${harnessName} does not support session listing.`,
      3,
    );
  }

  const refs = await adapter.listSessions();
  if (refs.length === 0) {
    throw new CliError("INVALID_ARGS", `No sessions found for harness ${harnessName}.`, 2);
  }

  process.stderr.write(`Found ${refs.length} ${harnessName} session(s). Processing...\n`);

  const payloads: TraceExportPayload[] = [];
  const manifests: RedactionManifest[] = [];
  let errors = 0;

  for (const ref of refs) {
    try {
      const content = await readUtf8(ref.path);
      const events = parseUnknownTranscript(content);
      const normalized = ensureMeaningfulLines(
        normalizeProviderEvents(harnessName as HarnessName, events),
        events,
      );

      const lines: PiSessionLine[] = [
        createSessionHeader({ sessionId: ref.id, cwd: "" }),
        createCustomEntry({
          customType: "autotune/provider_metadata",
          value: {
            harness: harnessName,
            provider: null,
            model: null,
            sessionId: ref.id,
            resolution: "direct:listSessions",
            confidence: "high",
            sourcePath: ref.path,
          },
        }),
        ...normalized,
      ];

      let finalLines = lines;
      if (shouldRedact) {
        const redactor = createRedactor(ref.id);
        const result = redactor.redact(lines);
        finalLines = result.lines;
        manifests.push(result.manifest);
      }

      payloads.push({
        traceId: ref.id,
        indexEntry: {
          harness: harnessName,
          provider: null,
          model: null,
          sessionId: ref.id,
          resolution: "direct:listSessions",
          confidence: "high",
          outcome: null,
          goal: null,
          reason: null,
          note: null,
          metadata: null,
          kind: "captured",
          filePath: ref.path,
          createdAt: new Date().toISOString(),
        },
        lines: finalLines,
      });
    } catch {
      errors += 1;
    }
  }

  if (payloads.length === 0) {
    throw new CliError("EXPORT_FAILED", `All ${refs.length} sessions failed to process.`, 8);
  }

  if (errors > 0) {
    process.stderr.write(`Skipped ${errors} session(s) due to errors.\n`);
  }

  const formatter = selectFormatter(format);
  const output = formatter(payloads);
  const totalRedactions = manifests.reduce((sum, m) => sum + m.count, 0);

  if (outputPath) {
    const resolved = path.resolve(outputPath);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, output, "utf8");
  }

  writeOutput(output, format, payloads.length, shouldRedact, totalRedactions, manifests, outputPath);
}

// ---------------------------------------------------------------------------
// Index-based export — reads from captured/merged traces in the project store
// ---------------------------------------------------------------------------

async function exportFromIndex(
  options: ExportCommandOptions,
  format: ExportFormat,
  shouldRedact: boolean,
  outputPath: string | null,
): Promise<void> {
  const project = await resolveProjectFromCwd(process.cwd());
  if (!project) {
    throw new CliError(
      "SETUP_REQUIRED",
      "No Autotune project found. Run autotune init first.",
      5,
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

  const formatter = selectFormatter(format);
  const output = formatter(payloads);
  const totalRedactions = manifests.reduce((sum, m) => sum + m.count, 0);

  if (outputPath) {
    const resolved = path.resolve(outputPath);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, output, "utf8");
  }

  writeOutput(output, format, payloads.length, shouldRedact, totalRedactions, manifests, outputPath);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function runExportCommand(options: ExportCommandOptions): Promise<void> {
  const format = (options.format ?? "sessions") as ExportFormat;
  if (!VALID_FORMATS.has(format)) {
    throw new CliError(
      "INVALID_ARGS",
      `Unknown export format "${format}". Valid: sessions, sharegpt, sft-jsonl, chatml, canonical`,
      2,
    );
  }

  const shouldRedact = options.redact !== false;
  const outputPath = options.output ?? null;

  if (options.harness) {
    await exportFromHarness(options.harness, format, shouldRedact, outputPath);
  } else {
    await exportFromIndex(options, format, shouldRedact, outputPath);
  }
}
