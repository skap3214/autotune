import { initProject } from "../core/project.js";
import { printJson } from "./shared.js";

export interface InitCommandOptions {
  yes?: boolean;
}

export async function runInitCommand(options: InitCommandOptions): Promise<void> {
  const result = await initProject(process.cwd());

  printJson({
    ok: true,
    created: result.created,
    skippedConfirmation: options.yes ?? false,
    project: {
      cwd: result.entry.cwd,
      projectId: result.entry.projectId,
      projectSlug: result.entry.projectSlug,
      projectHash: result.entry.projectHash,
      storePath: result.entry.storePath,
    },
    nextSteps: ["run autotune setup", "run autotune capture --harness <name>"],
  });
}
