import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

import { commandExists, runCommand } from "../core/process.js";
import { AUTOTUNE_HOME } from "../core/config.js";
import { ensureDir, pathExists, readJsonFile, writeJsonAtomic } from "../core/storage.js";
import type { SetupComponent, SetupInstallResult } from "./types.js";
import { getAssetPath } from "./assets.js";

async function copyAssetIfMissing(
  assetPath: string,
  targetPath: string,
  meta: Omit<SetupInstallResult, "status" | "reason">,
): Promise<SetupInstallResult> {
  if (await pathExists(targetPath)) {
    return { ...meta, status: "skipped", reason: "already_exists" };
  }

  await ensureDir(path.dirname(targetPath));
  const content = await fs.readFile(assetPath, "utf8");
  await fs.writeFile(targetPath, content, "utf8");
  return { ...meta, status: "installed" };
}

async function ensureJsonObject(filePath: string): Promise<Record<string, unknown>> {
  if (!(await pathExists(filePath))) {
    return {};
  }

  const parsed = await readJsonFile<unknown>(filePath);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Expected JSON object in ${filePath}`);
  }

  return parsed as Record<string, unknown>;
}

function mergeClaudeHookSettings(settings: Record<string, unknown>, command: string): Record<string, unknown> {
  const hooks =
    typeof settings.hooks === "object" && settings.hooks !== null && !Array.isArray(settings.hooks)
      ? ({ ...(settings.hooks as Record<string, unknown>) } as Record<string, unknown>)
      : {};

  const existingSessionStart = Array.isArray(hooks.SessionStart)
    ? [...(hooks.SessionStart as unknown[])]
    : [];

  const hookBlock = {
    hooks: [
      {
        type: "command",
        command,
      },
    ],
  };

  const hasCommand = existingSessionStart.some((entry) => {
    if (typeof entry !== "object" || entry === null) {
      return false;
    }
    const hooksArray = (entry as Record<string, unknown>).hooks;
    if (!Array.isArray(hooksArray)) {
      return false;
    }
    return hooksArray.some((hook) => {
      if (typeof hook !== "object" || hook === null) {
        return false;
      }
      return (hook as Record<string, unknown>).command === command;
    });
  });

  if (!hasCommand) {
    existingSessionStart.push(hookBlock);
  }

  hooks.SessionStart = existingSessionStart;
  return {
    ...settings,
    hooks,
  };
}

export const piAgentInstaller: SetupComponent = {
  component: "pi-agent",
  description: "Install the PI coding agent globally",
  async install() {
    if (await commandExists("pi")) {
      return {
        component: "pi-agent",
        target: "global",
        package: "@mariozechner/pi-coding-agent",
        status: "skipped",
        reason: "already_installed",
      };
    }

    await runCommand("npm", ["install", "-g", "@mariozechner/pi-coding-agent"], {
      timeoutMs: 300_000,
    });

    return {
      component: "pi-agent",
      target: "global",
      package: "@mariozechner/pi-coding-agent",
      status: "installed",
    };
  },
};

export const codexSkillInstaller: SetupComponent = {
  harness: "codex",
  component: "skill",
  description: "Install the Codex autotune-capture skill",
  async install() {
    return copyAssetIfMissing(
      getAssetPath("skills", "codex", "autotune-capture", "SKILL.md"),
      path.join(os.homedir(), ".codex", "skills", "autotune-capture", "SKILL.md"),
      {
        harness: "codex",
        component: "skill",
        target: path.join(os.homedir(), ".codex", "skills", "autotune-capture", "SKILL.md"),
      },
    );
  },
};

export const claudeSkillInstaller: SetupComponent = {
  harness: "claude-code",
  component: "instruction",
  description: "Install the Claude Code autotune-capture skill",
  async install() {
    return copyAssetIfMissing(
      getAssetPath("skills", "claude-code", "autotune-capture", "SKILL.md"),
      path.join(os.homedir(), ".claude", "skills", "autotune-capture", "SKILL.md"),
      {
        harness: "claude-code",
        component: "instruction",
        target: path.join(os.homedir(), ".claude", "skills", "autotune-capture", "SKILL.md"),
      },
    );
  },
};

export const claudeHookInstaller: SetupComponent = {
  harness: "claude-code",
  component: "helper",
  description: "Install the Claude Code session registry hook",
  async install() {
    const helperPath = path.join(AUTOTUNE_HOME, "helpers", "claude-code-session-registry.py");
    const settingsPath = path.join(os.homedir(), ".claude", "settings.json");
    const command = `python3 ${helperPath}`;

    await ensureDir(path.dirname(helperPath));
    await fs.copyFile(
      getAssetPath("hooks", "claude-code", "claude-code-session-registry.py"),
      helperPath,
    );

    const settings = await ensureJsonObject(settingsPath);
    const merged = mergeClaudeHookSettings(settings, command);
    await ensureDir(path.dirname(settingsPath));
    await writeJsonAtomic(settingsPath, merged);

    return {
      harness: "claude-code",
      component: "helper",
      target: settingsPath,
      status: "installed",
    };
  },
};

export const openCodeSkillInstaller: SetupComponent = {
  harness: "opencode",
  component: "instruction",
  description: "Install the OpenCode autotune-capture skill",
  async install() {
    return copyAssetIfMissing(
      getAssetPath("skills", "opencode", "autotune-capture", "SKILL.md"),
      path.join(os.homedir(), ".config", "opencode", "skills", "autotune-capture", "SKILL.md"),
      {
        harness: "opencode",
        component: "instruction",
        target: path.join(
          os.homedir(),
          ".config",
          "opencode",
          "skills",
          "autotune-capture",
          "SKILL.md",
        ),
      },
    );
  },
};

export const openCodePluginInstaller: SetupComponent = {
  harness: "opencode",
  component: "helper",
  description: "Install the OpenCode session env plugin",
  async install() {
    return copyAssetIfMissing(
      getAssetPath("plugins", "opencode", "autotune-session-env.js"),
      path.join(os.homedir(), ".config", "opencode", "plugins", "autotune-session-env.js"),
      {
        harness: "opencode",
        component: "helper",
        target: path.join(
          os.homedir(),
          ".config",
          "opencode",
          "plugins",
          "autotune-session-env.js",
        ),
      },
    );
  },
};

export const hermesSkillInstaller: SetupComponent = {
  harness: "hermes",
  component: "instruction",
  description: "Install the Hermes autotune-capture skill",
  async install() {
    return copyAssetIfMissing(
      getAssetPath("skills", "hermes", "autotune-capture", "SKILL.md"),
      path.join(os.homedir(), ".hermes", "skills", "autotune-capture", "SKILL.md"),
      {
        harness: "hermes",
        component: "instruction",
        target: path.join(os.homedir(), ".hermes", "skills", "autotune-capture", "SKILL.md"),
      },
    );
  },
};

export const hermesPluginInstaller: SetupComponent = {
  harness: "hermes",
  component: "helper",
  description: "Install the Hermes session-env plugin",
  async install() {
    const pluginDir = path.join(os.homedir(), ".hermes", "plugins", "session-env");
    const pluginYaml = path.join(pluginDir, "plugin.yaml");
    const initPy = path.join(pluginDir, "__init__.py");

    const existing = (await pathExists(pluginYaml)) && (await pathExists(initPy));
    if (existing) {
      return {
        harness: "hermes",
        component: "helper",
        target: pluginDir,
        status: "skipped",
        reason: "already_exists",
      };
    }

    await ensureDir(pluginDir);
    await fs.copyFile(
      getAssetPath("plugins", "hermes", "session-env", "plugin.yaml"),
      pluginYaml,
    );
    await fs.copyFile(
      getAssetPath("plugins", "hermes", "session-env", "__init__.py"),
      initPy,
    );

    return {
      harness: "hermes",
      component: "helper",
      target: pluginDir,
      status: "installed",
    };
  },
};

export const SETUP_COMPONENTS: SetupComponent[] = [
  piAgentInstaller,
  codexSkillInstaller,
  claudeSkillInstaller,
  claudeHookInstaller,
  openCodeSkillInstaller,
  openCodePluginInstaller,
  hermesSkillInstaller,
  hermesPluginInstaller,
];

export const KNOWN_HARNESSES = ["codex", "claude-code", "opencode", "hermes"] as const;
export type KnownHarness = (typeof KNOWN_HARNESSES)[number];

const SETUP_BUNDLES = {
  codex: {
    installers: [codexSkillInstaller],
    nextSteps: ["ask Codex to use the autotune-capture skill"],
  },
  "claude-code": {
    installers: [claudeSkillInstaller, claudeHookInstaller],
    nextSteps: ["restart Claude Code", "verify the autotune-capture skill is available"],
  },
  opencode: {
    installers: [openCodeSkillInstaller, openCodePluginInstaller],
    nextSteps: ["restart OpenCode", "verify OPENCODE_SESSION_ID is present in shell commands"],
  },
  hermes: {
    installers: [hermesSkillInstaller, hermesPluginInstaller],
    nextSteps: ["restart Hermes", "verify HERMES_SESSION_ID inside a Hermes session"],
  },
} satisfies Record<KnownHarness, { installers: SetupComponent[]; nextSteps: string[] }>;

export function getSetupBundle(harness: string) {
  if ((KNOWN_HARNESSES as readonly string[]).includes(harness)) {
    return SETUP_BUNDLES[harness as KnownHarness];
  }
  return null;
}
