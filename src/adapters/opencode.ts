import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import type { HarnessAdapter, ImportedTrace, SessionResolution } from "./types.js";
import { parseUnknownTranscript, readUtf8 } from "./utils.js";
import { ensureMeaningfulLines, normalizeProviderEvents } from "../format/normalizer.js";
import { pathExists } from "../core/storage.js";
import { runCommand } from "../core/process.js";

const execFileAsync = promisify(execFile);

const OPENCODE_DB_PATH = path.join(os.homedir(), ".local", "share", "opencode", "opencode.db");

async function readSessionFromDb(sessionId: string): Promise<string | null> {
  if (!(await pathExists(OPENCODE_DB_PATH))) {
    return null;
  }

  try {
    const { stdout } = await execFileAsync("sqlite3", [
      OPENCODE_DB_PATH,
      "-json",
      `SELECT m.data FROM message m WHERE m.session_id='${sessionId.replace(/'/g, "''")}' ORDER BY m.time_created;`,
    ]);

    const rows = JSON.parse(stdout) as Array<{ data: string }>;
    if (rows.length === 0) {
      return null;
    }

    // Each row.data is a JSON string representing a message.
    // Return as a JSON array of message objects.
    const messages = rows.map((row) => JSON.parse(row.data) as unknown);
    return JSON.stringify(messages);
  } catch {
    return null;
  }
}

async function findSessionIdForCwd(cwd: string): Promise<string | null> {
  if (!(await pathExists(OPENCODE_DB_PATH))) {
    return null;
  }

  try {
    const { stdout } = await execFileAsync("sqlite3", [
      OPENCODE_DB_PATH,
      `-separator`, `\t`,
      `SELECT id FROM session WHERE directory='${cwd.replace(/'/g, "''")}' ORDER BY time_updated DESC LIMIT 1;`,
    ]);

    const id = stdout.trim();
    return id || null;
  } catch {
    return null;
  }
}

export const opencodeAdapter: HarnessAdapter = {
  harness: "opencode",

  async resolve(options): Promise<SessionResolution> {
    if (options.traceFile) {
      const sourcePath = path.resolve(options.traceFile);
      return {
        harness: "opencode",
        sessionId: options.session ?? null,
        sourcePath,
        sourceContent: await readUtf8(sourcePath),
        resolution: { method: "flag:trace-file", confidence: "high" },
      };
    }

    const sessionId = options.session ?? process.env.OPENCODE_SESSION_ID ?? null;

    if (sessionId) {
      // Try local SQLite first.
      const dbContent = await readSessionFromDb(sessionId);
      if (dbContent) {
        return {
          harness: "opencode",
          sessionId,
          sourcePath: OPENCODE_DB_PATH,
          sourceContent: dbContent,
          resolution: {
            method: options.session ? "flag:session->local-db" : "env:OPENCODE_SESSION_ID->local-db",
            confidence: "high",
          },
        };
      }

      // Fall back to opencode export.
      try {
        const result = await runCommand("opencode", ["export", sessionId], {
          cwd: options.cwd,
        });
        return {
          harness: "opencode",
          sessionId,
          sourcePath: null,
          sourceContent: result.stdout,
          resolution: {
            method: options.session
              ? "flag:session->opencode export"
              : "env:OPENCODE_SESSION_ID->opencode export",
            confidence: "high",
          },
        };
      } catch {
        throw new Error(
          `Could not read OpenCode session ${sessionId} from local DB or opencode export.`,
        );
      }
    }

    // No explicit session — try to find the most recent session for this cwd.
    const cwdSessionId = await findSessionIdForCwd(options.cwd);
    if (cwdSessionId) {
      const dbContent = await readSessionFromDb(cwdSessionId);
      if (dbContent) {
        return {
          harness: "opencode",
          sessionId: cwdSessionId,
          sourcePath: OPENCODE_DB_PATH,
          sourceContent: dbContent,
          resolution: { method: "cwd:local-db", confidence: "medium" },
        };
      }
    }

    throw new Error("OpenCode capture requires OPENCODE_SESSION_ID, --session, or --trace-file in V0.");
  },

  async importSession(resolution): Promise<ImportedTrace> {
    const events = parseUnknownTranscript(resolution.sourceContent);

    // Try to extract model info from the first message.
    let model: string | null = null;
    let provider: string | null = null;
    if (Array.isArray(events) && events.length > 0) {
      const first = events[0] as Record<string, unknown> | undefined;
      if (first && typeof first === "object") {
        if (typeof (first as Record<string, unknown>).modelID === "string") {
          model = (first as Record<string, unknown>).modelID as string;
        }
        if (typeof (first as Record<string, unknown>).providerID === "string") {
          provider = (first as Record<string, unknown>).providerID as string;
        }
        const m = first.model as Record<string, unknown> | undefined;
        if (m && typeof m === "object") {
          if (typeof m.modelID === "string") model = m.modelID as string;
          if (typeof m.providerID === "string") provider = m.providerID as string;
        }
      }
    }

    const lines = ensureMeaningfulLines(normalizeProviderEvents("opencode", events), events);
    return {
      provider: provider ?? "opencode",
      model,
      lines,
    };
  },
};
