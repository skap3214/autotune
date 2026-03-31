import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

describe("runMergeCommand", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    delete process.env.AUTOTUNE_PI_COMMAND;
  });

  it("merges stored traces through the PI backend contract", async () => {
    const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "autotune-home-"));
    const projectCwd = await fs.mkdtemp(path.join(os.tmpdir(), "autotune-project-"));
    vi.spyOn(os, "homedir").mockReturnValue(tempHome);
    vi.spyOn(process, "cwd").mockReturnValue(projectCwd);

    const { initProject } = await import("../../src/core/project.js");
    const { readProjectIndex, writeProjectIndex } = await import("../../src/core/index.js");
    const { createSessionHeader, createMessageEntry, stringifyJsonl } = await import(
      "../../src/format/pi-session.js"
    );

    const initResult = await initProject(projectCwd);
    const traceAPath = path.join(initResult.entry.storePath, "traces", "trace_a.jsonl");
    const traceBPath = path.join(initResult.entry.storePath, "traces", "trace_b.jsonl");

    await fs.writeFile(
      traceAPath,
      stringifyJsonl([
        createSessionHeader({ sessionId: "trace_a", cwd: projectCwd }),
        createMessageEntry({ role: "user", text: "broken attempt" }),
      ]),
      "utf8",
    );
    await fs.writeFile(
      traceBPath,
      stringifyJsonl([
        createSessionHeader({ sessionId: "trace_b", cwd: projectCwd }),
        createMessageEntry({ role: "assistant", text: "working attempt" }),
      ]),
      "utf8",
    );

    const index = await readProjectIndex(initResult.entry.storePath);
    index.sessions.trace_a = {
      harness: "codex",
      provider: "openai",
      model: null,
      sessionId: "a",
      resolution: "test",
      confidence: "high",
      outcome: "failed",
      goal: "fix bug",
      reason: "wrong patch",
      note: null,
      metadata: null,
      kind: "captured",
      filePath: "traces/trace_a.jsonl",
      createdAt: new Date().toISOString(),
    };
    index.sessions.trace_b = {
      harness: "codex",
      provider: "openai",
      model: null,
      sessionId: "b",
      resolution: "test",
      confidence: "high",
      outcome: "successful",
      goal: "fix bug",
      reason: null,
      note: null,
      metadata: null,
      kind: "captured",
      filePath: "traces/trace_b.jsonl",
      createdAt: new Date().toISOString(),
    };
    await writeProjectIndex(initResult.entry.storePath, index);

    process.env.AUTOTUNE_PI_COMMAND = `printf '%s\n' '{"type":"session","id":"temp","timestamp":"2026-03-30T00:00:00Z","cwd":"${projectCwd}"}' '{"type":"message","id":"msg_x","timestamp":"2026-03-30T00:00:00Z","role":"assistant","text":"merged trace"}'`;

    const output: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      output.push(String(chunk));
      return true;
    });

    const { runMergeCommand } = await import("../../src/cli/merge.js");
    await runMergeCommand({ trace: ["trace_a", "trace_b"] });

    const payload = JSON.parse(output.join(""));
    expect(payload.ok).toBe(true);
    expect(payload.sourceTraceIds).toEqual(["trace_a", "trace_b"]);

    const mergedTracePath = path.join(
      initResult.entry.storePath,
      "traces",
      `${payload.mergedTraceId}.jsonl`,
    );
    const mergedContent = await fs.readFile(mergedTracePath, "utf8");
    expect(mergedContent).toContain("autotune/derivation");
    expect(mergedContent).toContain("merged trace");
  });
});
