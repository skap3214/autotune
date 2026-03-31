import inquirer from "inquirer";

import { detectHarnesses } from "../setup/detect.js";
import { getSetupBundle, KNOWN_HARNESSES, piAgentInstaller } from "../setup/installers.js";
import { CliError, printJson } from "./shared.js";

export interface SetupCommandOptions {
  harness?: string[];
  yes?: boolean;
}

export async function runSetupCommand(options: SetupCommandOptions): Promise<void> {
  const cwd = process.cwd();
  let requestedHarnesses = options.harness ?? [];

  if (options.yes && requestedHarnesses.length === 0) {
    throw new CliError(
      "INVALID_ARGS",
      "setup --yes requires at least one --harness value.",
      2,
    );
  }

  const installed: unknown[] = [];
  const skipped: unknown[] = [];
  const nextSteps = new Set<string>();

  const piResult = await piAgentInstaller.install(cwd);
  if (piResult.status === "installed") {
    installed.push(piResult);
  } else {
    skipped.push(piResult);
  }

  if (requestedHarnesses.length === 0) {
    const detectedHarnesses = await detectHarnesses(cwd);
    const defaultChoices = detectedHarnesses.length > 0 ? detectedHarnesses : KNOWN_HARNESSES;
    const answer = await inquirer.prompt<{ harnesses: string[] }>([
      {
        type: "checkbox",
        name: "harnesses",
        message: "Select harnesses to configure",
        choices: defaultChoices.map((harness) => ({
          name: harness,
          value: harness,
          checked: detectedHarnesses.includes(harness),
        })),
      },
    ]);

    requestedHarnesses = answer.harnesses;
  }

  if (requestedHarnesses.length === 0) {
    throw new CliError("INVALID_ARGS", "setup requires at least one harness.", 2);
  }

  for (const harness of requestedHarnesses) {
    const bundle = getSetupBundle(harness);
    if (!bundle) {
      throw new CliError(
        "UNSUPPORTED_COMPONENT",
        `Unsupported harness ${harness}.`,
        3,
      );
    }

    for (const installer of bundle.installers) {
      const result = await installer.install(cwd);
      if (result.status === "installed") {
        installed.push(result);
      } else {
        skipped.push(result);
      }
    }

    for (const step of bundle.nextSteps) {
      nextSteps.add(step);
    }
  }

  printJson({
    ok: true,
    installed,
    skipped,
    nextSteps: [...nextSteps],
  });
}
