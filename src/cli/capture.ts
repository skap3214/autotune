import fs from "node:fs/promises";
import path from "node:path";

import { HARNESS_ADAPTERS } from "../adapters/index.js";
import type { Outcome, HarnessName } from "../core/config.js";
import { resolveProjectFromCwd } from "../core/project.js";
import { updateProjectIndex } from "../core/index.js";
import { createTraceId } from "../core/trace-id.js";
import { createCustomEntry, createSessionHeader, stringifyJsonl } from "../format/pi-session.js";
import { CliError, printJson } from "./shared.js";

export interface CaptureCommandOptions {
  harness?: string;
  session?: string;
  traceFile?: string;
  transcriptPath?: string;
  goal?: string;
  outcome?: string;
  reason?: string;
  note?: string;
  metadata?: string;
}

function parseMetadata(metadata: string | undefined): Record<string, unknown> | null {
  if (!metadata) {
    return null;
  }

  const parsed = JSON.parse(metadata) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new CliError("INVALID_ARGS", "--metadata must be a JSON object.", 2);
  }

  return parsed as Record<string, unknown>;
}

export async function runCaptureCommand(options: CaptureCommandOptions): Promise<void> {
  if (!options.harness) {
    throw new CliError("INVALID_ARGS", "--harness is required.", 2);
  }

  const harness = options.harness as HarnessName;
  const adapter = HARNESS_ADAPTERS[harness];
  if (!adapter) {
    throw new CliError("UNSUPPORTED_COMPONENT", `Unsupported harness ${harness}.`, 3);
  }

  const project = await resolveProjectFromCwd(process.cwd());
  if (!project) {
    throw new CliError(
      "SETUP_REQUIRED",
      "No Autotune project found for the current directory. Run autotune init first.",
      5,
    );
  }

  let resolution;
  try {
    resolution = await adapter.resolve({
      cwd: process.cwd(),
      ...(options.session ? { session: options.session } : {}),
      ...(options.traceFile ? { traceFile: options.traceFile } : {}),
      ...(options.transcriptPath ? { transcriptPath: options.transcriptPath } : {}),
    });
  } catch (error) {
    throw new CliError(
      "SESSION_UNRESOLVED",
      error instanceof Error ? error.message : "Could not resolve a session.",
      4,
    );
  }

  let imported;
  try {
    imported = await adapter.importSession(resolution);
  } catch (error) {
    throw new CliError(
      "SESSION_UNRESOLVED",
      error instanceof Error ? error.message : "Could not import the resolved session.",
      4,
    );
  }
  const metadata = parseMetadata(options.metadata);
  const result = await updateProjectIndex(project.storePath, async (index) => {
    if (resolution.sessionId) {
      const existing = Object.entries(index.sessions).find(
        ([, entry]) => entry.harness === harness && entry.sessionId === resolution.sessionId,
      );

      if (existing) {
        return {
          ok: true,
          traceId: existing[0],
          deduped: true,
          harness,
          sessionId: resolution.sessionId,
          resolution: resolution.resolution,
          storedPath: path.join(project.storePath, existing[1].filePath),
        };
      }
    }

    const traceId = createTraceId();
    const storedPath = path.join(project.storePath, "traces", `${traceId}.jsonl`);

    const lines = [
      createSessionHeader({ sessionId: traceId, cwd: project.cwd }),
      createCustomEntry({
        customType: "autotune/provider_metadata",
        value: {
          harness,
          provider: imported.provider,
          model: imported.model,
          sessionId: resolution.sessionId,
          resolution: resolution.resolution.method,
          confidence: resolution.resolution.confidence,
          sourcePath: resolution.sourcePath,
        },
      }),
      createCustomEntry({
        customType: "autotune/trace_metadata",
        value: {
          goal: options.goal ?? null,
          outcome: (options.outcome as Outcome | undefined) ?? null,
          reason: options.reason ?? null,
          note: options.note ?? null,
          metadata,
          kind: "captured",
        },
      }),
      ...imported.lines,
    ];

    await fs.writeFile(storedPath, stringifyJsonl(lines), "utf8");

    index.sessions[traceId] = {
      harness,
      provider: imported.provider,
      model: imported.model,
      sessionId: resolution.sessionId,
      resolution: resolution.resolution.method,
      confidence: resolution.resolution.confidence,
      outcome: (options.outcome as Outcome | undefined) ?? null,
      goal: options.goal ?? null,
      reason: options.reason ?? null,
      note: options.note ?? null,
      metadata,
      kind: "captured",
      filePath: path.relative(project.storePath, storedPath),
      createdAt: new Date().toISOString(),
    };

    return {
      ok: true,
      traceId,
      harness,
      sessionId: resolution.sessionId,
      resolution: resolution.resolution,
      storedPath,
    };
  });

  printJson(result);
}
