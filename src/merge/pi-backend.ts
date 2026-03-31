import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { runCommand } from "../core/process.js";
import { cleanPiOutput, parseJsonlObjects, type PiSessionLine } from "../format/pi-session.js";

export async function runPiMerge(prompt: string): Promise<PiSessionLine[]> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "autotune-pi-"));
  const promptPath = path.join(tempDir, "merge-prompt.md");
  await fs.writeFile(promptPath, prompt, "utf8");

  const customCommand = process.env.AUTOTUNE_PI_COMMAND;
  let stdout = "";

  if (customCommand) {
    const result = await runCommand("bash", ["-lc", customCommand], {
      cwd: process.cwd(),
      env: { ...process.env, AUTOTUNE_PI_PROMPT_PATH: promptPath },
      timeoutMs: 300_000,
    });
    stdout = result.stdout;
  } else {
    const result = await runCommand(
      "pi",
      ["-p", "--no-session", `@${promptPath}`, "Return only the merged session JSONL."],
      {
        cwd: process.cwd(),
        env: process.env,
        timeoutMs: 300_000,
      },
    );
    stdout = result.stdout;
  }

  const cleaned = cleanPiOutput(stdout);
  const parsed = parseJsonlObjects(cleaned) as PiSessionLine[];
  if (parsed.length === 0) {
    throw new Error("PI returned no parseable JSONL output.");
  }

  return parsed;
}
