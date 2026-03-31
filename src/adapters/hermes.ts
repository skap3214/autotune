import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { HarnessAdapter, ImportedTrace, SessionRef, SessionResolution } from "./types.js";
import { listFilesRecursive, parseUnknownTranscript, readUtf8 } from "./utils.js";
import { ensureMeaningfulLines, normalizeProviderEvents, extractHermesMeta } from "../format/normalizer.js";
import { pathExists } from "../core/storage.js";
import { runCommand } from "../core/process.js";

function hermesSessionPath(sessionId: string): string {
  return path.join(os.homedir(), ".hermes", "sessions", `session_${sessionId}.json`);
}

async function readHermesSessionFile(sessionId: string): Promise<string | null> {
  const filePath = hermesSessionPath(sessionId);
  if (await pathExists(filePath)) {
    return readUtf8(filePath);
  }
  return null;
}

async function exportAndReadHermesSession(sessionId: string, cwd: string): Promise<string> {
  // `hermes sessions export <id>` writes to a file in cwd, not stdout.
  // Run the export, then read the resulting file.
  await runCommand("hermes", ["sessions", "export", sessionId], { cwd });

  // Hermes writes to a file named after the session id in the cwd.
  const exportedPath = path.join(cwd, sessionId);
  try {
    const content = await readUtf8(exportedPath);
    // Clean up the exported file.
    await fs.unlink(exportedPath).catch(() => {});
    return content;
  } catch {
    throw new Error(
      `hermes sessions export ran but the expected file ${exportedPath} was not found.`,
    );
  }
}

export const hermesAdapter: HarnessAdapter = {
  harness: "hermes",

  async listSessions(): Promise<SessionRef[]> {
    const sessionsDir = path.join(os.homedir(), ".hermes", "sessions");
    const files = await listFilesRecursive(sessionsDir, ".json");
    return files.map((filePath) => {
      const name = path.basename(filePath, ".json");
      const id = name.startsWith("session_") ? name.slice("session_".length) : name;
      return { id, path: filePath };
    });
  },

  async resolve(options): Promise<SessionResolution> {
    if (options.traceFile) {
      const sourcePath = path.resolve(options.traceFile);
      return {
        harness: "hermes",
        sessionId: process.env.HERMES_SESSION_ID ?? options.session ?? null,
        sourcePath,
        sourceContent: await readUtf8(sourcePath),
        resolution: { method: "flag:trace-file", confidence: "high" },
      };
    }

    const sessionId = options.session ?? process.env.HERMES_SESSION_ID ?? null;
    if (!sessionId) {
      throw new Error("Hermes capture requires HERMES_SESSION_ID or --session in V0.");
    }

    // Try reading the local session file directly first.
    const localContent = await readHermesSessionFile(sessionId);
    if (localContent) {
      return {
        harness: "hermes",
        sessionId,
        sourcePath: hermesSessionPath(sessionId),
        sourceContent: localContent,
        resolution: {
          method: options.session
            ? "flag:session->local-file"
            : "env:HERMES_SESSION_ID->local-file",
          confidence: "high",
        },
      };
    }

    // Fall back to hermes sessions export (writes to file, not stdout).
    const exportContent = await exportAndReadHermesSession(sessionId, options.cwd);
    return {
      harness: "hermes",
      sessionId,
      sourcePath: null,
      sourceContent: exportContent,
      resolution: {
        method: options.session
          ? "flag:session->hermes export"
          : "env:HERMES_SESSION_ID->hermes export",
        confidence: "high",
      },
    };
  },

  async importSession(resolution): Promise<ImportedTrace> {
    const events = parseUnknownTranscript(resolution.sourceContent);
    const meta = extractHermesMeta(events);
    const lines = ensureMeaningfulLines(normalizeProviderEvents("hermes", events), events);
    return {
      provider: "hermes",
      model: meta.model,
      lines,
    };
  },
};
