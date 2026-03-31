import type { HarnessName, ResolutionConfidence } from "../core/config.js";
import type { PiSessionLine } from "../format/pi-session.js";

export interface AdapterResolveOptions {
  cwd: string;
  session?: string;
  traceFile?: string;
  transcriptPath?: string;
}

export interface SessionResolution {
  harness: HarnessName;
  sessionId: string | null;
  sourcePath: string | null;
  sourceContent: string;
  resolution: {
    method: string;
    confidence: ResolutionConfidence;
  };
  metadata?: Record<string, unknown>;
}

export interface ImportedTrace {
  provider: string | null;
  model: string | null;
  lines: PiSessionLine[];
}

export interface HarnessAdapter {
  harness: HarnessName;
  resolve(options: AdapterResolveOptions): Promise<SessionResolution>;
  importSession(resolution: SessionResolution): Promise<ImportedTrace>;
}
