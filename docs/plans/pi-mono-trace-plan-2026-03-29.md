# PI Mono-Based Trace Platform Plan

Date: 2026-03-29

Related:

- [Agentic Trace Collection and RL Feasibility](/Users/soami/Desktop/code/int/autotune/docs/research/agentic-trace-rl-feasibility-2026-03-28.md)
- [Insights](/Users/soami/Desktop/code/int/autotune/docs/insights.md)

## Goal

Use the PI Mono session format as the canonical storage format for trace-like records in this project, while keeping training exports as explicit derived artifacts.

This gives us:

- a battle-tested append-only session container
- tree semantics via `id` and `parentId`
- extension points via `custom` and `custom_message`
- a path to store raw traces, curated traces, and merged/cleaned traces in one family of formats

## V0 Capture Model

V0 should be capture-first, not task-first.

The core user flow is:

1. an agent is already running
2. it does something wrong
3. the user or agent invokes Autotune
4. Autotune captures the provider session immediately

Because of that, an explicit `task create` step should not be required in V0.

Instead:

- every trace can be captured on its own
- the user may attach optional metadata
- curation can derive cross-trace grouping later

Optional metadata examples:

- `goal`
- `outcome`
- `tags`
- `provider`
- `sessionId`
- `whyBad`
- `model`
- `cwd`

## Decision

### Use PI Mono session JSONL as the canonical trace container

Adopt the PI Mono session structure for all trace-shaped records:

- one header line
- append-only JSONL entries
- immutable entry ids
- parent-linked tree structure
- branchable sessions

The source code shows:

- a versioned `session` header with `id`, `timestamp`, `cwd`, and optional `parentSession`
- generic append-only `message`, `custom`, `custom_message`, `label`, and `session_info` entries
- persistence as JSONL lines

This is a good fit for raw trace capture.

### Do not use the PI Mono session file as the only training format

The final "input -> expected output" or "trajectory -> preferred trajectory" examples should be stored in two ways:

1. as a derived trace/session in PI Mono-compatible format
2. as an explicit export object optimized for training pipelines

Reason:

- the trace form preserves provenance and makes human inspection easier
- the explicit export form makes SFT/preference/RL pipelines deterministic and less ambiguous

So the answer is: yes, store cleaned/merged/final trajectories in the same trace family, but also materialize them into dedicated dataset records.

## Storage Model

### 1. Raw session

Immutable imported trace from a provider/runtime.

Examples:

- Codex run
- Claude Code run
- Cursor agent run
- manual reconstructed session

Stored as:

- PI Mono session header
- provider-native messages mapped to `message`
- Autotune metadata in `custom` entries

### 2. Curated session

A trace derived from one or more raw sessions.

Examples:

- cleaned-up trajectory
- merged failed-then-successful trajectory
- abbreviated trace with noisy parts removed
- reviewer-annotated trajectory

Stored as:

- PI Mono session with `parentSession` or explicit source references
- `custom` entries that capture derivation metadata, confidence, and source attempt ids

### 3. Dataset example

A non-session artifact generated from raw or curated sessions.

Examples:

- SFT example
- preference pair
- RL trajectory with reward fields

Stored as:

- structured JSON artifact
- optionally referenced from the curated session via `custom` entry

## Provenance And Linkage

Right now the relationship should be treated as bidirectional and explicit.

### Forward link: dataset export -> sources

Every dataset export must include provenance fields that point back to the trace material it came from.

Minimum linkage fields:

- `rawSessionIds[]`
- `curatedSessionIds[]`
- `traceGroupIds[]` when traces have been grouped later
- `sourceEntryIds[]` when the export only uses part of a session
- `derivationType` such as `raw_to_export`, `merged_session_to_export`, or `llm_curated`
- `createdBy` such as `human`, `llm_curator`, or `verifier`

### Reverse link: session -> dataset exports

Any curated session that produces training data should also get an `autotune/dataset_export` custom entry referencing:

- export id
- export type
- timestamp
- export version

This makes it easy to start from a trace and answer "what training artifacts did we derive from this?"

### Linkage index

For V0, provenance links should live in the project `index.json`.

Suggested link types:

- `session_derived_from_session`
- `export_derived_from_raw_session`
- `export_derived_from_curated_session`
- `export_derived_from_trace_group`
- `export_supersedes_export`

If the project later outgrows a file-first index, these same link semantics can be migrated to SQLite or another store without changing the trace format.

### Why this matters

Without explicit linkage, we cannot reliably answer:

- which raw traces produced this SFT example
- which merged session used synthetic LLM-generated steps
- whether two exports reused the same underlying attempts
- what to invalidate if a curated session is rejected later

## Canonical Entities

Build project semantics on top of PI Mono instead of replacing it.

### Session-level entities

- `session`
- `trace_group` (optional, derived later)

### Entry-level entities

- `message`
- `tool_call`
- `tool_result`
- `annotation`
- `reward`
- `artifact_ref`
- `merge_metadata`

Not all of these need native PI Mono entry types. Most should be modeled via `custom` entries first.

## Namespacing Strategy

Use `customType` namespaced under `autotune/*`.

Examples:

- `autotune/provider_metadata`
- `autotune/trace_metadata`
- `autotune/trace_group_ref`
- `autotune/tool_call`
- `autotune/tool_result`
- `autotune/annotation`
- `autotune/reward`
- `autotune/merge_candidate`
- `autotune/dataset_export`

This lets us stay PI Mono-compatible without forking its base schema immediately.

## Proposed Session Conventions

### Session header

Reuse PI Mono header fields:

- `type: "session"`
- `version`
- `id`
- `timestamp`
- `cwd`
- `parentSession`

Add extra Autotune metadata in the first `custom` entries rather than modifying the header.

### Session identity

Map project concepts like this:

- one raw or curated provider session becomes one Autotune trace
- multiple traces may later be linked into a derived `trace_group`

This avoids forcing a task/attempt abstraction at capture time when the user just wants to save the broken run.

## Example Layering

### Raw imported session

- header
- `autotune/provider_metadata`
- `autotune/trace_metadata`
- imported messages
- imported tool call/result entries as `custom`

### Curated merged session

- header
- `autotune/trace_metadata`
- `autotune/derivation`
- `autotune/source_sessions`
- cleaned messages
- optional `custom_message` summary for context/debugging

### Dataset export object

- export id
- export type
- source session ids
- derived session id if applicable
- prompt / context / target fields
- preference or reward fields depending on export type

Recommended shape:

```json
{
  "id": "exp_123",
  "type": "sft",
  "rawSessionIds": ["sess_raw_a", "sess_raw_b"],
  "curatedSessionIds": ["sess_cur_1"],
  "traceGroupIds": ["grp_1"],
  "sourceEntryIds": ["e1", "e2", "e3"],
  "derivationType": "llm_curated",
  "createdBy": "llm_curator",
  "input": {},
  "target": {},
  "metadata": {}
}
```

## CLI Scope For V0

### Primary commands

1. `autotune init`

- initialize local store
- create config
- select storage backend
- register the current working directory as a project in the global local store

2. `autotune setup`

- install harness-specific setup artifacts when needed
- examples: Hermes session-id plugin, harness-native skill/command wrappers, PI coding agent install/config

Recommended modes:

- interactive: `autotune setup`
- non-interactive: `autotune setup --harness <name> --component <name> --yes`

3. `autotune capture`

- capture the current provider session using provider-specific export/transcript mechanisms

4. `autotune trace import`

- import a provider-native session/log
- map into PI Mono-compatible session JSONL

5. `autotune trace start`

- create a manual session for agent/self logging

6. `autotune trace append`

- append entries from a script, agent hook, or adapter

7. `autotune annotate`

- add or edit trace-level metadata like tags, outcome, goal, and notes

8. `autotune trace link`

- link traces after capture
- mark `failed_before_success`, `retry_of`, `derived_from`, `same_problem`, etc.

9. `autotune merge`

- use PI coding agent as the default and only V0 merge backend to merge one or more traces into an idealized merged trace
- save the merged result as a curated session
- keep raw traces untouched and preserve provenance

Important constraint:

- merge must support more than two traces
- merge must support traces captured from different harnesses/providers

So the merge backend itself does not need a pluggable harness abstraction in V0.
The harness/session metadata is attached during capture and should travel with each stored trace.

Suggested inputs:

- repeated trace ids
- or a trace-id manifest file

Suggested flags:

- `--trace <trace-id>`
- `--traces-file <path>`
- `--merge-session <id>` only if PI itself is being resumed/continued and needs explicit context later
- `--model <name>` when relevant
- `--note <text>`
- `--draft` if we later want a non-canonical preview mode

Example shapes:

```bash
autotune merge \
  --trace trace_1 \
  --trace trace_2 \
  --trace trace_3 \
  --model <pi-model>

autotune merge \
  --traces-file traces.json \
  --model <pi-model>
```

Suggested manifest shape:

```json
{
  "traces": ["trace_1", "trace_2", "trace_3"],
  "merge": {
    "backend": "pi",
    "sessionId": null,
    "model": null
  }
}
```

10. `autotune export sft`

- create SFT examples from accepted sessions

11. `autotune export preference`

- create preference pairs from linked attempts

### Deferred commands

- `autotune export rl`
- `autotune train run`
- `autotune sync push`

### `autotune setup` UX

`autotune setup` should support both human-guided installation and scriptable one-liners that an agent can call directly.

#### Interactive mode

Use when a human is setting up the project or adding harness support manually.

Example:

```bash
autotune setup
```

Behavior:

- detect installed/supported harnesses
- show available setup components per harness
- explain what each component does
- ask for confirmation before writing files outside the repo
- install the selected components
- print verification steps

#### Non-interactive mode

Use when an agent or harness wants to install required support deterministically.

Example shapes:

```bash
autotune setup --harness hermes --component session-env-plugin --yes
autotune setup --harness codex --component skill --yes
autotune setup --harness claude-code --component command --yes
```

Behavior:

- no prompts when `--yes` is passed
- exit non-zero on unsupported harness/component combinations
- print machine-parseable success/failure output if `--json` is requested

#### Suggested flags

- `--harness <name>`
- `--component <name>` repeatable
- `--all`
- `--yes`
- `--dry-run`
- `--json`
- `--force`
- `--target <path>` for custom install locations when supported

#### Suggested components

- `skill`
- `command`
- `subagent`
- `plugin`
- `session-env-plugin`
- `registry-hook`
- `pi-agent`

#### Why both modes matter

- humans need discoverability and explanation
- agents need deterministic one-liners they can invoke without a conversation loop

## Harness Instruction Layer

In addition to provider adapters, we should add harness-facing instruction artifacts so the agent knows when and how to invoke Autotune.

This is separate from capture adapters:

- adapters solve import and normalization
- harness instruction artifacts solve invocation behavior

### Strategy

Use the native reusable-instruction surface for each harness instead of forcing one file format everywhere.

Recommended mapping:

- Codex: `SKILL.md` skill
- OpenCode: `SKILL.md` skill
- Hermes: `SKILL.md` skill
- OpenClaw: `SKILL.md` skill
- Claude Code: slash command and/or subagent

### Shared core

Maintain one shared Autotune workflow reference document and wrap it per harness.

The shared content should define:

- when to invoke `autotune capture`
- when to invoke `autotune merge`
- session-id resolution order
- metadata to attach
- fallback behavior when resolution is ambiguous

### Setup-required harnesses

Some harnesses need a setup step in addition to instruction files.

Example:

- Hermes needs a small plugin installed under `~/.hermes/plugins/` to expose `HERMES_SESSION_ID`
- merge needs PI coding agent installed and minimally configured

So the plan should include an `autotune setup` command capable of installing provider/harness-specific helpers.

The command must support:

- interactive project setup for humans
- one-line deterministic installation for agents and harnesses

### Harness-specific wrappers

Each wrapper should only add:

- native file syntax
- native installation path
- native session-id resolver order
- native guidance for passing traces into the PI merge backend
- provider-specific caveats

### Why this matters

We need the agent to know:

- that Autotune exists
- when it should be used
- how to resolve session context for the current harness
- what to do when the session id cannot be found confidently

## LLM Merge Pass

The merge agent should not directly mutate raw sessions.

Its job is to:

- inspect one or more source traces
- handle heterogeneous source harnesses
- infer the idealized merged trajectory
- preserve provenance back to the source traces
- mark synthetic or reconstructed steps explicitly
- save the result as a curated merged session

V0 simplification:

- use PI coding agent as the single merge backend
- do not build separate merge adapters per harness
- require PI to be installed/configured via `autotune setup` if missing

Internally, we can still stage this as a draft/proposal workflow if needed, but the primary user-facing command should just be `autotune merge`.

## Merge Policy

### Allowed

- merge multiple attempts into a curated "idealized" trajectory
- fill in metadata gaps
- summarize noisy tool chatter
- normalize provider-specific message shapes

### Not allowed

- silently overwrite raw traces
- drop provenance
- present generated steps as if they came from the original session

If the LLM invents missing steps, those steps must be marked as synthetic in derivation metadata.

## File Layout

Recommended local-first structure:

```text
~/.autotune/
  registry/
    projects.json
  projects/
    <project-slug>--<project-hash>/
      config.json
      tasks/
        <task-id>.json
      attempts/
        <attempt-id>.json
      sessions/
        raw/
          <session-id>.jsonl
        curated/
          <session-id>.jsonl
      exports/
        sft/
          <export-id>.json
        preference/
          <export-id>.json
        rl/
          <export-id>.json
      blobs/
        <artifact-id>
```

### Why global storage

The user goal is correct: traces should be easy to find on-device without polluting the repo itself.

So `autotune init` should not create a heavy `.autotune/` directory in the current project by default. Instead, it should create a project store under `~/.autotune/projects/`.

### Project directory naming

Do not use only the current folder name.

This will collide for common repo names like:

- `~/code/api`
- `~/work/api`
- `~/tmp/api`

Instead use:

- human-readable basename from the cwd
- deterministic short hash from the absolute cwd

Recommended format:

```text
~/.autotune/projects/autotune--a1b2c3d4/
```

Where:

- `autotune` comes from the current directory basename
- `a1b2c3d4` is a short stable hash of the absolute project path

This gives:

- easy manual browsing
- no collisions across same-named repos
- deterministic lookup from cwd

### Registry lookup

`autotune init` should also write a registry entry keyed by absolute cwd.

Suggested fields:

- `cwd`
- `projectId`
- `projectSlug`
- `projectHash`
- `storePath`
- `createdAt`
- `updatedAt`

Then later commands can resolve the active project by:

1. reading the current cwd
2. hashing/normalizing it
3. consulting `~/.autotune/registry/projects.json`
4. falling back to deterministic path derivation if needed

### Optional repo-local pointer

This should be optional, not required.

If we ever want faster discovery or explicit project pinning, we can add a tiny pointer file in the repo root later, but V0 does not need it if global registry lookup is deterministic.

### Resulting store layout

```text
~/.autotune/
  config.json
  registry/
    projects.json
  projects/
    autotune--a1b2c3d4/
      config.json
      tasks/
      attempts/
      sessions/
      exports/
      blobs/
```

## Database Plan

For V0:

- files on disk for sessions and exports
- a per-project `index.json` for session lookup and provenance links

Why:

- JSONL is ideal for append-only trace files
- a flat JSON index is simpler than a database for the initial `init/setup/capture/merge` loop

## Hosted Plan

When hosted storage is added, keep the same model:

- session blobs in object storage
- index metadata in Postgres
- encrypted artifact storage
- redacted and raw stores separated

Do not change the on-disk canonical format when adding hosted sync.

## Implementation Phases

### Phase 1: Core data model

- define local store layout
- define task/attempt/session index schema
- define `autotune/*` custom entry contracts
- build PI Mono-compatible parser/writer

### Phase 2: Manual CLI

- task creation
- manual session creation
- append custom entries
- link attempts to tasks

### Phase 3: Provider adapters

Start with one provider/runtime that is easy to control.

Selection criteria:

- accessible local logs or event stream
- tool call visibility
- stable enough to support import hooks

### Phase 4: LLM curation

- propose merges
- propose clean trajectories
- produce curated sessions
- generate export candidates

### Phase 5: Training exports

- SFT exports
- preference exports
- provenance manifests

### Phase 6: Verifiers and RL exports

- test/build/lint/user acceptance rewards
- explicit RL trajectory export

## Recommended Design Constraint

Keep the abstraction order strict:

1. raw session
2. curated session
3. dataset export

If we maintain that separation, PI Mono can work as the common trace substrate without making the training layer vague.

## Immediate Next Step

Implement the local data model and the first CLI commands:

- `autotune init`
- `autotune setup`
- `autotune capture`
- `autotune trace start`
- `autotune trace append`
- `autotune annotate`
- `autotune trace link`

That is enough to validate the storage model before building adapters or training logic.

## Source Notes

PI Mono fit is based on the session manager implementation in `badlogic/pi-mono`, specifically:

- versioned session header and tree-linked entries
- append-only JSONL persistence
- generic extension entries via `custom` and `custom_message`
- labels and session metadata via `label` and `session_info`

Useful source files:

- https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/session-manager.ts
- https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/messages.ts
