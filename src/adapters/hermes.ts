import path from "node:path";

import type { HarnessAdapter, ImportedTrace, SessionResolution } from "./types.js";
import { parseUnknownTranscript, readUtf8 } from "./utils.js";
import { ensureMeaningfulLines, normalizeProviderEvents } from "../format/normalizer.js";
import { runCommand } from "../core/process.js";

export const hermesAdapter: HarnessAdapter = {
  harness: "hermes",

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

    const result = await runCommand("hermes", ["sessions", "export", sessionId], {
      cwd: options.cwd,
    });

    return {
      harness: "hermes",
      sessionId,
      sourcePath: null,
      sourceContent: result.stdout,
      resolution: {
        method: options.session ? "flag:session->hermes export" : "env:HERMES_SESSION_ID",
        confidence: "high",
      },
    };
  },

  async importSession(resolution): Promise<ImportedTrace> {
    const events = parseUnknownTranscript(resolution.sourceContent);
    const lines = ensureMeaningfulLines(normalizeProviderEvents("hermes", events), events);
    return {
      provider: "hermes",
      model: null,
      lines,
    };
  },
};
