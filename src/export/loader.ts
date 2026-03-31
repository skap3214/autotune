import fs from "node:fs/promises";
import path from "node:path";

import type { ProjectIndex, SessionIndexEntry } from "../core/config.js";
import type { PiSessionLine } from "../format/pi-session.js";

export async function loadTraceLines(
  storePath: string,
  filePath: string,
): Promise<PiSessionLine[]> {
  const fullPath = path.join(storePath, filePath);
  const content = await fs.readFile(fullPath, "utf8");
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as PiSessionLine);
}

export function resolveTraceIds(
  index: ProjectIndex,
  options: { trace?: string[] | undefined; kind?: string | undefined },
): string[] {
  if (options.trace && options.trace.length > 0) {
    for (const id of options.trace) {
      const entry = index.sessions[id];
      if (!entry) {
        throw new Error(`Trace ${id} does not exist in this project.`);
      }
    }
    return options.trace;
  }

  const kind = options.kind ?? "all";
  return Object.entries(index.sessions)
    .filter(([, entry]) => kind === "all" || (entry as SessionIndexEntry).kind === kind)
    .map(([id]) => id);
}
