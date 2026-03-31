import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { HarnessAdapter, ImportedTrace, SessionRef, SessionResolution } from "./types.js";
import { listFilesRecursive, parseUnknownTranscript, readUtf8 } from "./utils.js";
import { ensureMeaningfulLines, normalizeProviderEvents, extractClaudeMeta } from "../format/normalizer.js";

async function findClaudeSessionFileById(sessionId: string): Promise<string | null> {
  const root = path.join(os.homedir(), ".claude");
  const candidates = await listFilesRecursive(root, ".json");
  const transcriptCandidates = await listFilesRecursive(root, ".jsonl");
  const files = [...candidates, ...transcriptCandidates];

  for (const filePath of files) {
    try {
      const content = await readUtf8(filePath);
      if (content.includes(sessionId)) {
        return filePath;
      }
    } catch {
      // ignore unreadable files
    }
  }

  return null;
}

async function resolveClaudePidHeuristic(): Promise<{ path: string; sessionId: string | null } | null> {
  const envPpid = process.env.PPID;
  if (!envPpid) {
    return null;
  }

  const sessionPath = path.join(os.homedir(), ".claude", "sessions", `${envPpid}.json`);
  try {
    const content = await fs.readFile(sessionPath, "utf8");
    const parsed = JSON.parse(content) as Record<string, unknown>;
    return {
      path: sessionPath,
      sessionId: typeof parsed.sessionId === "string" ? parsed.sessionId : null,
    };
  } catch {
    return null;
  }
}

async function resolveClaudeRegistry(): Promise<{
  path: string;
  transcriptPath: string | null;
  sessionId: string | null;
} | null> {
  const registryPath = path.join(os.homedir(), ".autotune", "runtime", "claude-code-session.json");
  try {
    const content = await fs.readFile(registryPath, "utf8");
    const parsed = JSON.parse(content) as Record<string, unknown>;
    return {
      path: registryPath,
      transcriptPath: typeof parsed.transcript_path === "string" ? parsed.transcript_path : null,
      sessionId: typeof parsed.session_id === "string" ? parsed.session_id : null,
    };
  } catch {
    return null;
  }
}

export const claudeCodeAdapter: HarnessAdapter = {
  harness: "claude-code",

  async listSessions(): Promise<SessionRef[]> {
    const projectsDir = path.join(os.homedir(), ".claude", "projects");
    const files = await listFilesRecursive(projectsDir, ".jsonl");
    return files.map((filePath) => ({
      id: path.basename(filePath, ".jsonl"),
      path: filePath,
    }));
  },

  async resolve(options): Promise<SessionResolution> {
    if (options.traceFile) {
      const sourcePath = path.resolve(options.traceFile);
      return {
        harness: "claude-code",
        sessionId: null,
        sourcePath,
        sourceContent: await readUtf8(sourcePath),
        resolution: { method: "flag:trace-file", confidence: "high" },
      };
    }

    if (options.transcriptPath) {
      const sourcePath = path.resolve(options.transcriptPath);
      return {
        harness: "claude-code",
        sessionId: options.session ?? null,
        sourcePath,
        sourceContent: await readUtf8(sourcePath),
        resolution: { method: "flag:transcript-path", confidence: "high" },
      };
    }

    if (options.session) {
      const filePath = await findClaudeSessionFileById(options.session);
      if (filePath) {
        return {
          harness: "claude-code",
          sessionId: options.session,
          sourcePath: filePath,
          sourceContent: await readUtf8(filePath),
          resolution: { method: "flag:session", confidence: "high" },
        };
      }
    }

    const registry = await resolveClaudeRegistry();
    if (registry?.transcriptPath) {
      return {
        harness: "claude-code",
        sessionId: registry.sessionId,
        sourcePath: registry.transcriptPath,
        sourceContent: await readUtf8(registry.transcriptPath),
        resolution: { method: "registry:~/.autotune/runtime/claude-code-session.json", confidence: "high" },
      };
    }

    const heuristic = await resolveClaudePidHeuristic();
    if (heuristic) {
      return {
        harness: "claude-code",
        sessionId: heuristic.sessionId,
        sourcePath: heuristic.path,
        sourceContent: await readUtf8(heuristic.path),
        resolution: { method: "heuristic:pid-session-file", confidence: "low" },
      };
    }

    throw new Error("Could not resolve a Claude Code transcript.");
  },

  async importSession(resolution): Promise<ImportedTrace> {
    const events = parseUnknownTranscript(resolution.sourceContent);
    const meta = extractClaudeMeta(events);
    const lines = ensureMeaningfulLines(normalizeProviderEvents("claude-code", events), events);
    return {
      provider: "anthropic",
      model: meta.model,
      lines,
    };
  },
};
