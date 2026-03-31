import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { parseJsonlObjects } from "../format/pi-session.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function listFilesRecursive(
  root: string,
  extension: string,
): Promise<string[]> {
  const results: string[] = [];

  async function walk(current: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && fullPath.endsWith(extension)) {
        results.push(fullPath);
      }
    }
  }

  await walk(root);
  return results;
}

export async function readUtf8(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf8");
}

export function expandHome(inputPath: string): string {
  if (inputPath.startsWith("~/")) {
    return path.join(os.homedir(), inputPath.slice(2));
  }
  return inputPath;
}

export function parseUnknownTranscript(content: string): unknown[] {
  const trimmed = content.trim();
  if (!trimmed) {
    return [];
  }

  try {
    return parseJsonlObjects(trimmed);
  } catch {
    // Fall through to JSON parsing.
  }

  const parsed = JSON.parse(trimmed) as unknown;
  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (isRecord(parsed)) {
    if (Array.isArray(parsed.messages)) {
      return parsed.messages;
    }

    if (Array.isArray(parsed.events)) {
      return parsed.events;
    }

    if (Array.isArray(parsed.items)) {
      return parsed.items;
    }
  }

  return [parsed];
}

export function firstRecord(events: unknown[]): Record<string, unknown> | null {
  for (const event of events) {
    if (isRecord(event)) {
      return event;
    }
  }
  return null;
}
