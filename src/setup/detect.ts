import os from "node:os";
import path from "node:path";

import { commandExists } from "../core/process.js";
import { pathExists } from "../core/storage.js";
import type { HarnessName } from "../core/config.js";

export async function detectHarnesses(cwd: string): Promise<HarnessName[]> {
  const detected = new Set<HarnessName>();

  if ((await pathExists(path.join(os.homedir(), ".codex"))) || (await commandExists("codex"))) {
    detected.add("codex");
  }

  if (
    (await pathExists(path.join(cwd, ".claude"))) ||
    (await pathExists(path.join(os.homedir(), ".claude"))) ||
    (await commandExists("claude"))
  ) {
    detected.add("claude-code");
  }

  if (
    (await pathExists(path.join(os.homedir(), ".config", "opencode"))) ||
    (await pathExists(path.join(cwd, ".opencode"))) ||
    (await commandExists("opencode"))
  ) {
    detected.add("opencode");
  }

  if ((await pathExists(path.join(os.homedir(), ".hermes"))) || (await commandExists("hermes"))) {
    detected.add("hermes");
  }

  return [...detected];
}
