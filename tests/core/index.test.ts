import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

describe("project index updates", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("serializes concurrent index mutations without dropping entries", async () => {
    const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "autotune-home-"));
    vi.spyOn(os, "homedir").mockReturnValue(tempHome);

    const projectCwd = await fs.mkdtemp(path.join(os.tmpdir(), "autotune-project-"));
    const { initProject } = await import("../../src/core/project.js");
    const { readProjectIndex, updateProjectIndex } = await import("../../src/core/index.js");

    const project = await initProject(projectCwd);

    await Promise.all([
      updateProjectIndex(project.entry.storePath, async (index) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        index.sessions.trace_a = {
          harness: "codex",
          provider: null,
          model: null,
          sessionId: "a",
          resolution: "test",
          confidence: "high",
          outcome: null,
          goal: null,
          reason: null,
          note: null,
          metadata: null,
          kind: "captured",
          filePath: "traces/trace_a.jsonl",
          createdAt: new Date().toISOString(),
        };
      }),
      updateProjectIndex(project.entry.storePath, async (index) => {
        index.sessions.trace_b = {
          harness: "codex",
          provider: null,
          model: null,
          sessionId: "b",
          resolution: "test",
          confidence: "high",
          outcome: null,
          goal: null,
          reason: null,
          note: null,
          metadata: null,
          kind: "captured",
          filePath: "traces/trace_b.jsonl",
          createdAt: new Date().toISOString(),
        };
      }),
    ]);

    const index = await readProjectIndex(project.entry.storePath);
    expect(index.sessions.trace_a).toBeDefined();
    expect(index.sessions.trace_b).toBeDefined();
  });
});
