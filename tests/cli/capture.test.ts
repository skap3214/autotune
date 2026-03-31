import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

describe("runCaptureCommand", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("captures a Codex session into the project trace store", async () => {
    const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "autotune-home-"));
    const projectCwd = await fs.mkdtemp(path.join(os.tmpdir(), "autotune-project-"));
    vi.spyOn(os, "homedir").mockReturnValue(tempHome);
    vi.spyOn(process, "cwd").mockReturnValue(projectCwd);

    const sessionId = "session-123";
    const sessionPath = path.join(
      tempHome,
      ".codex",
      "sessions",
      "2026",
      "03",
      "30",
      "rollout.jsonl",
    );
    await fs.mkdir(path.dirname(sessionPath), { recursive: true });
    await fs.writeFile(
      sessionPath,
      [
        JSON.stringify({
          type: "session_meta",
          payload: {
            id: sessionId,
            cwd: projectCwd,
            model_provider: "openai",
            model: "gpt-5.4",
          },
        }),
        JSON.stringify({
          type: "event_msg",
          payload: { type: "user_message", message: "fix the failing tests" },
        }),
        JSON.stringify({
          type: "event_msg",
          payload: { type: "agent_message", message: "I will inspect the failing tests." },
        }),
      ].join("\n"),
      "utf8",
    );

    const { initProject } = await import("../../src/core/project.js");
    const initResult = await initProject(projectCwd);

    const output: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      output.push(String(chunk));
      return true;
    });

    const { runCaptureCommand } = await import("../../src/cli/capture.js");
    await runCaptureCommand({
      harness: "codex",
      session: sessionId,
      outcome: "failed",
      goal: "fix the failing tests",
      reason: "inspected but did not patch",
    });

    const payload = JSON.parse(output.join(""));
    expect(payload.ok).toBe(true);
    expect(payload.sessionId).toBe(sessionId);

    const tracePath = path.join(initResult.entry.storePath, "traces", `${payload.traceId}.jsonl`);
    const traceContent = await fs.readFile(tracePath, "utf8");
    expect(traceContent).toContain("autotune/provider_metadata");
    expect(traceContent).toContain("fix the failing tests");
  });
});
