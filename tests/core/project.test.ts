import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

describe("project helpers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("creates an idempotent project store rooted under ~/.autotune", async () => {
    const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "autotune-home-"));
    vi.spyOn(os, "homedir").mockReturnValue(tempHome);

    const projectCwd = await fs.mkdtemp(path.join(os.tmpdir(), "autotune-project-"));
    const { initProject, resolveProjectFromCwd } = await import("../../src/core/project.js");

    const first = await initProject(projectCwd);
    const second = await initProject(projectCwd);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.entry.projectSlug).toBe(first.entry.projectSlug);

    const resolved = await resolveProjectFromCwd(path.join(projectCwd, "nested", "dir"));
    expect(resolved?.cwd).toBe(projectCwd);

    const tracesDir = path.join(first.entry.storePath, "traces");
    await expect(fs.stat(tracesDir)).resolves.toBeTruthy();
  });
});
