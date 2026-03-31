import os from "node:os";
import path from "node:path";

export const SCHEMA_VERSION = 1;

export const AUTOTUNE_HOME = path.join(os.homedir(), ".autotune");
export const GLOBAL_CONFIG_PATH = path.join(AUTOTUNE_HOME, "config.json");
export const REGISTRY_DIR = path.join(AUTOTUNE_HOME, "registry");
export const PROJECTS_DIR = path.join(AUTOTUNE_HOME, "projects");
export const REGISTRY_PATH = path.join(REGISTRY_DIR, "projects.json");

export type TraceKind = "captured" | "merged";
export type ResolutionConfidence = "high" | "medium" | "low";
export type Outcome = "failed" | "partial" | "successful" | "unknown";
export type HarnessName = "codex" | "claude-code" | "opencode" | "hermes";

export interface GlobalConfig {
  version: number;
}

export interface ProjectConfig {
  version: number;
  cwd: string;
  createdAt: string;
}

export interface RegistryEntry {
  cwd: string;
  projectId: string;
  projectSlug: string;
  projectHash: string;
  storePath: string;
  createdAt: string;
  updatedAt: string;
}

export interface RegistryFile {
  version: number;
  projects: RegistryEntry[];
}

export interface SessionIndexEntry {
  harness: string | null;
  provider: string | null;
  model: string | null;
  sessionId: string | null;
  resolution: string | null;
  confidence: ResolutionConfidence | null;
  outcome: Outcome | null;
  goal: string | null;
  reason: string | null;
  note: string | null;
  metadata: Record<string, unknown> | null;
  kind: TraceKind;
  filePath: string;
  createdAt: string;
}

export interface SessionLink {
  sourceId: string;
  targetId: string;
  linkType: "merged_into";
  createdAt: string;
}

export interface ProjectIndex {
  version: number;
  sessions: Record<string, SessionIndexEntry>;
  links: SessionLink[];
}

export function createDefaultGlobalConfig(): GlobalConfig {
  return { version: SCHEMA_VERSION };
}

export function createDefaultRegistry(): RegistryFile {
  return { version: SCHEMA_VERSION, projects: [] };
}

export function createDefaultProjectIndex(): ProjectIndex {
  return { version: SCHEMA_VERSION, sessions: {}, links: [] };
}
