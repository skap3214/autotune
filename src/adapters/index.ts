import type { HarnessName } from "../core/config.js";
import type { HarnessAdapter } from "./types.js";
import { claudeCodeAdapter } from "./claude-code.js";
import { codexAdapter } from "./codex.js";
import { hermesAdapter } from "./hermes.js";
import { opencodeAdapter } from "./opencode.js";

export const HARNESS_ADAPTERS: Record<HarnessName, HarnessAdapter> = {
  codex: codexAdapter,
  "claude-code": claudeCodeAdapter,
  opencode: opencodeAdapter,
  hermes: hermesAdapter,
};
