import type { HarnessName, Outcome, ResolutionConfidence, TraceKind } from "../core/config.js";

export interface ProviderMetadataValue {
  harness: HarnessName;
  provider: string | null;
  model: string | null;
  sessionId: string | null;
  resolution: string;
  confidence: ResolutionConfidence;
  sourcePath: string | null;
}

export interface TraceMetadataValue {
  goal: string | null;
  outcome: Outcome | null;
  reason: string | null;
  note: string | null;
  metadata: Record<string, unknown> | null;
  kind: TraceKind;
}

export interface ToolCallValue {
  tool: string;
  input: unknown;
}

export interface ToolResultValue {
  tool: string;
  output: unknown;
}

export interface DerivationValue {
  derivationType: "idealized" | "merged";
  backend: "pi";
  sourceTraceIds: string[];
}
