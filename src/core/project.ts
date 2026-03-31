import crypto from "node:crypto";
import path from "node:path";

import {
  AUTOTUNE_HOME,
  GLOBAL_CONFIG_PATH,
  PROJECTS_DIR,
  REGISTRY_DIR,
  REGISTRY_PATH,
  SCHEMA_VERSION,
  type ProjectConfig,
  type RegistryEntry,
  type RegistryFile,
  createDefaultGlobalConfig,
  createDefaultRegistry,
} from "./config.js";
import { ensureProjectIndex } from "./index.js";
import { ensureDir, ensureJsonFile, pathExists, readJsonFile, writeJsonAtomic } from "./storage.js";

export interface InitProjectResult {
  created: boolean;
  entry: RegistryEntry;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function computeProjectHash(cwd: string): string {
  return crypto.createHash("sha256").update(cwd).digest("hex").slice(0, 8);
}

export function computeProjectSlug(cwd: string): string {
  const basename = path.basename(cwd);
  return `${basename}--${computeProjectHash(cwd)}`;
}

export function getProjectStorePath(cwd: string): string {
  return path.join(PROJECTS_DIR, computeProjectSlug(cwd));
}

function createProjectConfig(cwd: string): ProjectConfig {
  return {
    version: SCHEMA_VERSION,
    cwd,
    createdAt: nowIso(),
  };
}

async function ensureGlobalLayout(): Promise<void> {
  await ensureDir(AUTOTUNE_HOME);
  await ensureDir(REGISTRY_DIR);
  await ensureDir(PROJECTS_DIR);
  await ensureJsonFile(GLOBAL_CONFIG_PATH, createDefaultGlobalConfig);
  await ensureJsonFile<RegistryFile>(REGISTRY_PATH, createDefaultRegistry);
}

async function readRegistry(): Promise<RegistryFile> {
  await ensureGlobalLayout();
  return readJsonFile<RegistryFile>(REGISTRY_PATH);
}

async function writeRegistry(registry: RegistryFile): Promise<void> {
  await writeJsonAtomic(REGISTRY_PATH, registry);
}

async function ensureProjectFiles(storePath: string, cwd: string): Promise<void> {
  await ensureDir(storePath);
  await ensureDir(path.join(storePath, "traces"));

  const projectConfigPath = path.join(storePath, "config.json");
  if (!(await pathExists(projectConfigPath))) {
    await writeJsonAtomic(projectConfigPath, createProjectConfig(cwd));
  }

  await ensureProjectIndex(storePath);
}

export async function initProject(cwdInput: string): Promise<InitProjectResult> {
  const cwd = path.resolve(cwdInput);
  await ensureGlobalLayout();

  const registry = await readRegistry();
  const existing = registry.projects.find((entry) => entry.cwd === cwd);

  if (existing) {
    existing.updatedAt = nowIso();
    await ensureProjectFiles(existing.storePath, cwd);
    await writeRegistry(registry);
    return { created: false, entry: existing };
  }

  const createdAt = nowIso();
  const entry: RegistryEntry = {
    cwd,
    projectId: crypto.randomUUID(),
    projectSlug: computeProjectSlug(cwd),
    projectHash: computeProjectHash(cwd),
    storePath: getProjectStorePath(cwd),
    createdAt,
    updatedAt: createdAt,
  };

  registry.projects.push(entry);
  await ensureProjectFiles(entry.storePath, cwd);
  await writeRegistry(registry);

  return { created: true, entry };
}

export async function resolveProjectFromCwd(cwdInput: string): Promise<RegistryEntry | null> {
  await ensureGlobalLayout();
  const registry = await readRegistry();

  let current = path.resolve(cwdInput);

  while (true) {
    const match = registry.projects.find((entry) => entry.cwd === current);
    if (match) {
      return match;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}
