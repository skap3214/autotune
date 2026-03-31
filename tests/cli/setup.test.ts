import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

describe("runSetupCommand", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("installs the Codex default bundle without reinstalling pi when pi already exists", async () => {
    const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "autotune-home-"));
    vi.spyOn(os, "homedir").mockReturnValue(tempHome);

    const processModule = await import("../../src/core/process.js");
    vi.spyOn(processModule, "commandExists").mockImplementation(async (command) => command === "pi");
    const runCommandSpy = vi.spyOn(processModule, "runCommand");

    const output: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      output.push(String(chunk));
      return true;
    });

    const { runSetupCommand } = await import("../../src/cli/setup.js");
    await runSetupCommand({ harness: ["codex"], yes: true });

    expect(runCommandSpy).not.toHaveBeenCalledWith(
      "npm",
      ["install", "-g", "@mariozechner/pi-coding-agent"],
      expect.anything(),
    );

    const skillPath = path.join(
      tempHome,
      ".codex",
      "skills",
      "autotune-capture",
      "SKILL.md",
    );
    await expect(fs.readFile(skillPath, "utf8")).resolves.toContain("CODEX_THREAD_ID");

    const payload = JSON.parse(output.join(""));
    expect(payload.ok).toBe(true);
    expect(payload.installed).toHaveLength(1);
    expect(payload.skipped[0].component).toBe("pi-agent");
  });

  it("installs the Claude Code user-level command and helper hook", async () => {
    const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "autotune-home-"));
    vi.spyOn(os, "homedir").mockReturnValue(tempHome);

    const processModule = await import("../../src/core/process.js");
    vi.spyOn(processModule, "commandExists").mockImplementation(async (command) => command === "pi");

    const output: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      output.push(String(chunk));
      return true;
    });

    const { runSetupCommand } = await import("../../src/cli/setup.js");
    await runSetupCommand({ harness: ["claude-code"], yes: true });

    const commandPath = path.join(tempHome, ".claude", "commands", "autotune-capture.md");
    const settingsPath = path.join(tempHome, ".claude", "settings.json");
    const helperPath = path.join(
      tempHome,
      ".autotune",
      "helpers",
      "claude-code-session-registry.py",
    );

    await expect(fs.readFile(commandPath, "utf8")).resolves.toContain("Autotune trace");
    await expect(fs.readFile(helperPath, "utf8")).resolves.toContain("session metadata");

    const settings = JSON.parse(await fs.readFile(settingsPath, "utf8"));
    expect(settings.hooks.SessionStart[0].hooks[0].command).toContain(
      "claude-code-session-registry.py",
    );

    const payload = JSON.parse(output.join(""));
    expect(payload.ok).toBe(true);
    expect(payload.installed).toHaveLength(2);
  });
});
