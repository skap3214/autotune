import path from "node:path";

import type { HarnessAdapter, ImportedTrace, SessionResolution } from "./types.js";
import { parseUnknownTranscript, readUtf8 } from "./utils.js";
import { ensureMeaningfulLines, normalizeProviderEvents } from "../format/normalizer.js";
import { runCommand } from "../core/process.js";

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
      const result = await runCommand("opencode", ["export", sessionId], {
        cwd: options.cwd,
      });
      return {
        harness: "opencode",
        sessionId,
        sourcePath: null,
        sourceContent: result.stdout,
        resolution: {
          method: options.session ? "flag:session->opencode export" : "env:OPENCODE_SESSION_ID",
          confidence: "high",
        },
      };
    }

    throw new Error("OpenCode capture requires OPENCODE_SESSION_ID, --session, or --trace-file in V0.");
  },

  async importSession(resolution): Promise<ImportedTrace> {
    const events = parseUnknownTranscript(resolution.sourceContent);
    const lines = ensureMeaningfulLines(normalizeProviderEvents("opencode", events), events);
    return {
      provider: "opencode",
      model: null,
      lines,
    };
  },
};
