import fs from "node:fs/promises";
import path from "node:path";

import {
  type ProjectIndex,
  createDefaultProjectIndex,
} from "./config.js";
import { ensureJsonFile, writeJsonAtomic } from "./storage.js";

const LOCK_RETRY_MS = 100;
const LOCK_MAX_ATTEMPTS = 20;

function getIndexPath(projectStorePath: string): string {
  return path.join(projectStorePath, "index.json");
}

function getLockPath(projectStorePath: string): string {
  return path.join(projectStorePath, ".index.lock");
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireLock(lockPath: string): Promise<void> {
  for (let attempt = 0; attempt < LOCK_MAX_ATTEMPTS; attempt += 1) {
    try {
      const handle = await fs.open(lockPath, "wx");
      await handle.close();
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") {
        throw error;
      }
      await sleep(LOCK_RETRY_MS);
    }
  }

  const error = new Error(`Could not acquire index lock at ${lockPath}`);
  error.name = "IndexLockError";
  throw error;
}

async function releaseLock(lockPath: string): Promise<void> {
  try {
    await fs.unlink(lockPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw error;
    }
  }
}

export async function ensureProjectIndex(projectStorePath: string): Promise<ProjectIndex> {
  return ensureJsonFile<ProjectIndex>(getIndexPath(projectStorePath), createDefaultProjectIndex);
}

export async function readProjectIndex(projectStorePath: string): Promise<ProjectIndex> {
  return ensureProjectIndex(projectStorePath);
}

export async function writeProjectIndex(
  projectStorePath: string,
  index: ProjectIndex,
): Promise<void> {
  const lockPath = getLockPath(projectStorePath);
  await acquireLock(lockPath);

  try {
    await writeJsonAtomic(getIndexPath(projectStorePath), index);
  } finally {
    await releaseLock(lockPath);
  }
}

export async function updateProjectIndex<T>(
  projectStorePath: string,
  updater: (index: ProjectIndex) => Promise<T> | T,
): Promise<T> {
  const lockPath = getLockPath(projectStorePath);
  await acquireLock(lockPath);

  try {
    const index = await ensureJsonFile<ProjectIndex>(
      getIndexPath(projectStorePath),
      createDefaultProjectIndex,
    );
    const result = await updater(index);
    await writeJsonAtomic(getIndexPath(projectStorePath), index);
    return result;
  } finally {
    await releaseLock(lockPath);
  }
}
