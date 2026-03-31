#!/usr/bin/env node

import { Command, Option } from "commander";

import { runCaptureCommand } from "./cli/capture.js";
import { runInitCommand } from "./cli/init.js";
import { runMergeCommand } from "./cli/merge.js";
import { runSetupCommand } from "./cli/setup.js";
import { runCliAction } from "./cli/shared.js";

const program = new Command();

program
  .name("autotune")
  .description("Agentic trace capture and merge CLI")
  .version("0.1.0");

program
  .command("init")
  .description("Initialize a project store for the current working directory")
  .option("--yes", "skip confirmation")
  .action((options) => runCliAction(() => runInitCommand(options)));

program
  .command("setup")
  .description("Install harness-specific instruction files and helper components")
  .option("--harness <name>", "target harness", (value, previous: string[] = []) => {
    previous.push(value);
    return previous;
  })
  .option("--yes", "skip prompts")
  .action((options) => runCliAction(() => runSetupCommand(options)));

program
  .command("capture")
  .description("Resolve a provider session, ingest it, and store it as a trace")
  .requiredOption("--harness <name>", "target harness")
  .option("--session <id>", "explicit session id")
  .option("--trace-file <path>", "direct file import")
  .option("--transcript-path <path>", "provider transcript file")
  .option("--goal <text>", "what the agent was trying to do")
  .option("--outcome <value>", "failed, partial, successful, unknown")
  .option("--reason <text>", "why the trace is being captured")
  .option("--note <text>", "freeform annotation")
  .option("--metadata <json>", "optional JSON object for extra capture metadata")
  .action((options) => runCliAction(() => runCaptureCommand(options)));

program
  .command("merge")
  .description("Produce an idealized merged trace from one or more stored traces")
  .option("--trace <id>", "repeatable trace id", (value, previous: string[] = []) => {
    previous.push(value);
    return previous;
  })
  .option("--traces-file <path>", "manifest file")
  .option("--note <text>", "merge annotation")
  .action((options) => runCliAction(() => runMergeCommand(options)));

await program.parseAsync(process.argv);
