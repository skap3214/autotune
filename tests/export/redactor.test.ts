import { describe, expect, it } from "vitest";
import { createRedactor } from "../../src/export/redactor.js";
import type { PiSessionLine } from "../../src/format/pi-session.js";
import { createMessageEntry, createCustomEntry, createSessionHeader } from "../../src/format/pi-session.js";

describe("createRedactor", () => {
  it("redacts email addresses with stable placeholders", () => {
    const redactor = createRedactor("test");
    const lines: PiSessionLine[] = [
      createMessageEntry({ role: "user", text: "send to john@example.com" }),
      createMessageEntry({ role: "assistant", text: "emailing john@example.com now" }),
    ];

    const { lines: redacted, manifest } = redactor.redact(lines);

    const first = redacted[0] as { text: string };
    const second = redacted[1] as { text: string };
    expect(first.text).toContain("<EMAIL_1>");
    expect(first.text).not.toContain("john@example.com");
    // Same email gets same placeholder.
    expect(second.text).toContain("<EMAIL_1>");
    expect(manifest.count).toBe(1);
    expect(manifest.byCategory.EMAIL).toBe(1);
  });

  it("redacts provider tokens", () => {
    const redactor = createRedactor("test");
    const lines: PiSessionLine[] = [
      createMessageEntry({ role: "user", text: "key is sk-ant-abcdefghijklmnopqrstuvwxyz" }),
    ];

    const { lines: redacted } = redactor.redact(lines);
    const msg = redacted[0] as { text: string };
    expect(msg.text).toContain("<PROVIDER_TOKEN_1>");
    expect(msg.text).not.toContain("sk-ant-");
  });

  it("redacts JWTs", () => {
    const redactor = createRedactor("test");
    const jwt = "eyJGQUtFIjoiMSJ9.eyJGQUtFIjoiMiJ9.FAKESIGNATURE123";
    const lines: PiSessionLine[] = [
      createMessageEntry({ role: "user", text: `token: ${jwt}` }),
    ];

    const { lines: redacted } = redactor.redact(lines);
    const msg = redacted[0] as { text: string };
    expect(msg.text).toContain("<JWT_1>");
    expect(msg.text).not.toContain("eyJ");
  });

  it("redacts filesystem paths in session headers", () => {
    const redactor = createRedactor("test");
    const lines: PiSessionLine[] = [
      createSessionHeader({ sessionId: "test", cwd: "/Users/soami/project" }),
    ];

    const { lines: redacted } = redactor.redact(lines);
    const header = redacted[0] as { cwd: string };
    expect(header.cwd).toContain("<FS_PATH_1>");
    expect(header.cwd).not.toContain("/Users/soami");
  });

  it("redacts nested values in custom entries", () => {
    const redactor = createRedactor("test");
    const lines: PiSessionLine[] = [
      createCustomEntry({
        customType: "autotune/tool_result",
        value: {
          tool: "bash",
          output: "config password=hunter2 done",
        },
      }),
    ];

    const { lines: redacted } = redactor.redact(lines);
    const custom = redacted[0] as { value: { tool: string; output: string } };
    // Structural key "tool" is not redacted.
    expect(custom.value.tool).toBe("bash");
    // Password in value is redacted.
    expect(custom.value.output).toContain("<PASSWORD_1>");
    expect(custom.value.output).not.toContain("hunter2");
  });

  it("does not modify clean content", () => {
    const redactor = createRedactor("test");
    const lines: PiSessionLine[] = [
      createMessageEntry({ role: "user", text: "fix the tests please" }),
    ];

    const { lines: redacted, manifest } = redactor.redact(lines);
    const msg = redacted[0] as { text: string };
    expect(msg.text).toBe("fix the tests please");
    expect(manifest.count).toBe(0);
  });
});
