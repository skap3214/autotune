import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

describe("runInitCommand", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("prints machine-readable JSON for a newly initialized project", async () => {
    const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "autotune-home-"));
    const projectCwd = await fs.mkdtemp(path.join(os.tmpdir(), "autotune-project-"));

    vi.spyOn(os, "homedir").mockReturnValue(tempHome);
    vi.spyOn(process, "cwd").mockReturnValue(projectCwd);

    const writes: string[] = [];
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });

    const { runInitCommand } = await import("../../src/cli/init.js");
    await runInitCommand({});

    writeSpy.mockRestore();

    const payload = JSON.parse(writes.join(""));
    expect(payload.ok).toBe(true);
    expect(payload.project.cwd).toBe(projectCwd);
    expect(payload.project.storePath).toContain(".autotune/projects/");
  });
});
