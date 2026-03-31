import os from "node:os";
import path from "node:path";

import type { HarnessAdapter, ImportedTrace, SessionResolution } from "./types.js";
import { listFilesRecursive, parseUnknownTranscript, readUtf8 } from "./utils.js";
import { normalizeProviderEvents, ensureMeaningfulLines } from "../format/normalizer.js";

function extractCodexSessionMeta(events: unknown[]): {
  sessionId: string | null;
  provider: string | null;
  model: string | null;
  cwd: string | null;
} {
  const meta = events.find(
    (event) =>
      typeof event === "object" &&
      event !== null &&
      "type" in event &&
      (event as Record<string, unknown>).type === "session_meta",
  ) as Record<string, unknown> | undefined;

  const payload =
    meta && typeof meta.payload === "object" && meta.payload !== null
      ? (meta.payload as Record<string, unknown>)
      : null;

  return {
    sessionId: typeof payload?.id === "string" ? payload.id : null,
    provider: typeof payload?.model_provider === "string" ? payload.model_provider : null,
    model: typeof payload?.model === "string" ? payload.model : null,
    cwd: typeof payload?.cwd === "string" ? payload.cwd : null,
  };
}

async function findCodexSessionFileById(sessionId: string): Promise<string | null> {
  const root = path.join(os.homedir(), ".codex", "sessions");
  const files = (await listFilesRecursive(root, ".jsonl")).sort().reverse();

  for (const filePath of files) {
    const content = await readUtf8(filePath);
    const events = parseUnknownTranscript(content);
    const meta = extractCodexSessionMeta(events);
    if (meta.sessionId === sessionId) {
      return filePath;
    }
  }

  return null;
}

async function findMostRecentCodexSessionForCwd(cwd: string): Promise<string | null> {
  const root = path.join(os.homedir(), ".codex", "sessions");
  const files = (await listFilesRecursive(root, ".jsonl")).sort().reverse();

  for (const filePath of files) {
    const content = await readUtf8(filePath);
    const events = parseUnknownTranscript(content);
    const meta = extractCodexSessionMeta(events);
    if (meta.cwd === cwd) {
      return filePath;
    }
  }

  return null;
}

export const codexAdapter: HarnessAdapter = {
  harness: "codex",

  async resolve(options) {
    if (options.traceFile) {
      const sourcePath = path.resolve(options.traceFile);
      return {
        harness: "codex",
        sessionId: null,
        sourcePath,
        sourceContent: await readUtf8(sourcePath),
        resolution: { method: "flag:trace-file", confidence: "high" },
      };
    }

    const explicitSession = options.session ?? process.env.CODEX_THREAD_ID ?? null;
    if (explicitSession) {
      const filePath = await findCodexSessionFileById(explicitSession);
      if (filePath) {
        return {
          harness: "codex",
          sessionId: explicitSession,
          sourcePath: filePath,
          sourceContent: await readUtf8(filePath),
          resolution: {
            method: options.session ? "flag:session" : "env:CODEX_THREAD_ID",
            confidence: "high",
          },
        };
      }
    }

    const filePath = await findMostRecentCodexSessionForCwd(options.cwd);
    if (!filePath) {
      throw new Error("Could not resolve a Codex session for the current directory.");
    }

    return {
      harness: "codex",
      sessionId: null,
      sourcePath: filePath,
      sourceContent: await readUtf8(filePath),
      resolution: { method: "cwd:~/.codex/sessions", confidence: "medium" },
    };
  },

  async importSession(resolution): Promise<ImportedTrace> {
    const events = parseUnknownTranscript(resolution.sourceContent);
    const meta = extractCodexSessionMeta(events);
    const lines = ensureMeaningfulLines(normalizeProviderEvents("codex", events), events);

    return {
      provider: meta.provider,
      model: meta.model,
      lines,
    };
  },
};
