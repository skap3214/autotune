import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

describe("runExportCommand", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("exports a captured trace as sft-jsonl with redaction", async () => {
    const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "autotune-home-"));
    const projectCwd = await fs.mkdtemp(path.join(os.tmpdir(), "autotune-project-"));
    vi.spyOn(os, "homedir").mockReturnValue(tempHome);
    vi.spyOn(process, "cwd").mockReturnValue(projectCwd);

    const { initProject } = await import("../../src/core/project.js");
    const { readProjectIndex, writeProjectIndex } = await import("../../src/core/index.js");
    const { createSessionHeader, createMessageEntry, createCustomEntry, stringifyJsonl } =
      await import("../../src/format/pi-session.js");

    const initResult = await initProject(projectCwd);
    const tracePath = path.join(initResult.entry.storePath, "traces", "trace_test.jsonl");

    await fs.writeFile(
      tracePath,
      stringifyJsonl([
        createSessionHeader({ sessionId: "trace_test", cwd: "/Users/testuser/myproject" }),
        createCustomEntry({
          customType: "autotune/provider_metadata",
          value: {
            harness: "codex",
            provider: "openai",
            model: "gpt-5",
            sessionId: "sess_123",
            resolution: "test",
            confidence: "high",
            sourcePath: null,
          },
        }),
        createCustomEntry({
          customType: "autotune/trace_metadata",
          value: {
            goal: "fix auth bug",
            outcome: "failed",
            reason: "wrong file",
            note: null,
            metadata: null,
            kind: "captured",
          },
        }),
        createMessageEntry({ role: "user", text: "my email is dev@secret.com, fix the auth" }),
        createMessageEntry({ role: "assistant", text: "I will fix the auth middleware." }),
      ]),
      "utf8",
    );

    const index = await readProjectIndex(initResult.entry.storePath);
    index.sessions.trace_test = {
      harness: "codex",
      provider: "openai",
      model: "gpt-5",
      sessionId: "sess_123",
      resolution: "test",
      confidence: "high",
      outcome: "failed",
      goal: "fix auth bug",
      reason: "wrong file",
      note: null,
      metadata: null,
      kind: "captured",
      filePath: "traces/trace_test.jsonl",
      createdAt: new Date().toISOString(),
    };
    await writeProjectIndex(initResult.entry.storePath, index);

    const outputPath = path.join(tempHome, "export.jsonl");
    const output: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      output.push(String(chunk));
      return true;
    });

    const { runExportCommand } = await import("../../src/cli/export.js");
    await runExportCommand({
      trace: ["trace_test"],
      format: "sft-jsonl",
      output: outputPath,
    });

    const payload = JSON.parse(output.join(""));
    expect(payload.ok).toBe(true);
    expect(payload.format).toBe("sft-jsonl");
    expect(payload.traceCount).toBe(1);
    expect(payload.redaction.enabled).toBe(true);

    const exported = await fs.readFile(outputPath, "utf8");
    const parsed = JSON.parse(exported.trim());
    expect(parsed.id).toBe("trace_test");
    expect(parsed.messages).toHaveLength(2);
    // Email should be redacted.
    expect(parsed.messages[0].content).toContain("<EMAIL_1>");
    expect(parsed.messages[0].content).not.toContain("dev@secret.com");
    // Clean text should be preserved.
    expect(parsed.messages[1].content).toBe("I will fix the auth middleware.");
  });

  it("preserves sensitive data when --no-redact is used", async () => {
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
    const tracePath = path.join(initResult.entry.storePath, "traces", "trace_raw.jsonl");

    await fs.writeFile(
      tracePath,
      stringifyJsonl([
        createSessionHeader({ sessionId: "trace_raw", cwd: "/tmp/test" }),
        createMessageEntry({ role: "user", text: "email is dev@secret.com" }),
      ]),
      "utf8",
    );

    const index = await readProjectIndex(initResult.entry.storePath);
    index.sessions.trace_raw = {
      harness: "codex",
      provider: null,
      model: null,
      sessionId: null,
      resolution: "test",
      confidence: "high",
      outcome: null,
      goal: null,
      reason: null,
      note: null,
      metadata: null,
      kind: "captured",
      filePath: "traces/trace_raw.jsonl",
      createdAt: new Date().toISOString(),
    };
    await writeProjectIndex(initResult.entry.storePath, index);

    const stderrOutput: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderrOutput.push(String(chunk));
      return true;
    });

    const stdoutOutput: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdoutOutput.push(String(chunk));
      return true;
    });

    const { runExportCommand } = await import("../../src/cli/export.js");
    await runExportCommand({
      trace: ["trace_raw"],
      format: "sessions",
      redact: false,
    });

    const raw = stdoutOutput.join("");
    expect(raw).toContain("dev@secret.com");
  });
});
