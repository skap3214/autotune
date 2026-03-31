import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import type { HarnessAdapter, ImportedTrace, SessionRef, SessionResolution } from "./types.js";
import { parseUnknownTranscript, readUtf8 } from "./utils.js";
import { ensureMeaningfulLines, normalizeProviderEvents, extractOpenCodeMeta } from "../format/normalizer.js";
import { pathExists } from "../core/storage.js";
import { runCommand } from "../core/process.js";

const execFileAsync = promisify(execFile);

const OPENCODE_DB_PATH = path.join(os.homedir(), ".local", "share", "opencode", "opencode.db");

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

async function readSessionFromDb(sessionId: string): Promise<string | null> {
  if (!(await pathExists(OPENCODE_DB_PATH))) {
    return null;
  }

  try {
    const escaped = escapeSql(sessionId);

    // Read messages.
    const { stdout: msgStdout } = await execFileAsync("sqlite3", [
      OPENCODE_DB_PATH,
      "-json",
      `SELECT id, data, time_created FROM message WHERE session_id='${escaped}' ORDER BY time_created;`,
    ]);

    const msgRows = JSON.parse(msgStdout) as Array<{ id: string; data: string; time_created: number }>;
    if (msgRows.length === 0) {
      return null;
    }

    // Read parts for richer tool/text data.
    const { stdout: partStdout } = await execFileAsync("sqlite3", [
      OPENCODE_DB_PATH,
      "-json",
      `SELECT message_id, data, time_created FROM part WHERE session_id='${escaped}' ORDER BY message_id, time_created;`,
    ]);

    let partRows: Array<{ message_id: string; data: string; time_created: number }> = [];
    try {
      partRows = JSON.parse(partStdout) as typeof partRows;
    } catch {
      // parts table might not exist or be empty.
    }

    // Index parts by message_id.
    const partsByMsg = new Map<string, unknown[]>();
    for (const row of partRows) {
      try {
        const parsed = JSON.parse(row.data) as unknown;
        const list = partsByMsg.get(row.message_id);
        if (list) {
          list.push(parsed);
        } else {
          partsByMsg.set(row.message_id, [parsed]);
        }
      } catch {
        // skip unparseable parts
      }
    }

    // Enrich messages with their parts.
    const messages = msgRows.map((row) => {
      const msg = JSON.parse(row.data) as Record<string, unknown>;
      const parts = partsByMsg.get(row.id);
      if (parts && parts.length > 0) {
        msg.parts = parts;
      }
      return msg;
    });

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

  async listSessions(): Promise<SessionRef[]> {
    if (!(await pathExists(OPENCODE_DB_PATH))) {
      return [];
    }
    try {
      const { stdout } = await execFileAsync("sqlite3", [
        OPENCODE_DB_PATH,
        "-separator", "\t",
        "SELECT id FROM session ORDER BY time_updated DESC;",
      ]);
      return stdout
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((id) => ({ id, path: OPENCODE_DB_PATH }));
    } catch {
      return [];
    }
  },

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
    const meta = extractOpenCodeMeta(events);
    const lines = ensureMeaningfulLines(normalizeProviderEvents("opencode", events), events);
    return {
      provider: meta.provider ?? "opencode",
      model: meta.model,
      lines,
    };
  },
};
