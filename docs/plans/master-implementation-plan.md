# Autotune Master Implementation Plan

Date: 2026-03-30

Consolidates and supersedes:

- [PI Mono-Based Trace Platform Plan](pi-mono-trace-plan-2026-03-29.md)
- [CLI Contract V0](cli-contract-v0-2026-03-30.md)
- [Language Decision](../architecture/language-decision-2026-03-30.md)
- [Provider Trace Capture Research](../research/provider-trace-capture-2026-03-29.md)
- [Harness Instruction Surfaces Research](../research/harness-instruction-surfaces-2026-03-29.md)
- [Agentic Trace RL Feasibility](../research/agentic-trace-rl-feasibility-2026-03-28.md)
- [Competitive Landscape](../research/competitive-landscape-2026-03-30.md)
- [Hermes Session ID Plugin](../hermes-session-id-plugin.md)
- [Insights](../insights.md)

---

## 1. What Autotune Is

A local-first CLI that captures tool-use traces from coding agents and merges
them into idealized trajectories for later training/export workflows.

The core loop:

```
agent session → autotune capture → captured trace
                                      ↓
                              autotune merge → merged trace
                                      ↓
                              autotune export → SFT / preference / RL dataset
```

**V0 scope**: capture + merge. Export and training are deferred.

---

## 2. Decided Architecture

### 2.1 Language

TypeScript/Node for the core product. Harness-native languages only for thin
bridge helpers (e.g. Python for the Hermes plugin).

Rationale: PI coding agent is in the npm ecosystem, the work is CLI-heavy and
JSON-heavy, and global npm install is simpler than managing Python environments.

### 2.2 Storage

Local-first. All data under `~/.autotune/`.

```
~/.autotune/
  config.json                        # global config
  registry/
    projects.json                    # cwd → project mapping
  projects/
    <basename>--<path-hash>/
      config.json                    # project config
      index.json                     # session index (flat JSON file)
      traces/
        <trace-id>.jsonl             # captured or merged trace
```

Project directory naming: `<basename>--<8-char-hex-of-sha256(abs-cwd)>`.
Example: `autotune--a1b2c3d4`.

**Global config** (`~/.autotune/config.json`):

```json
{
  "version": 1
}
```

- `version`: schema version for forward-compatible migrations.

V0 only needs `version`. Other fields are nullable placeholders so the shape
is stable from day one.

**Project config** (`<project>/config.json`):

```json
{
  "version": 1,
  "cwd": "/absolute/path/to/project",
  "createdAt": "2026-03-30T00:00:00Z"
}
```

- `version`: schema version.
- `cwd`: the absolute path this project was initialized from.
- `createdAt`: when the project was created.

Project config is deliberately minimal in V0. Per-project overrides (e.g.
preferred model, harness hints) can be added later without breaking the shape.

### 2.3 Trace format

PI Mono session JSONL. Each file is append-only:

- Line 1: session header (`type: "session"`, `id`, `timestamp`, `cwd`,
  optional `parentSession`)
- Subsequent lines: message, custom, custom_message, label, session_info entries
- Autotune-specific entries use `customType` namespaced as `autotune/*`

Custom entry types:

| customType | Purpose |
|---|---|
| `autotune/provider_metadata` | source harness, provider, model, session id, resolution method |
| `autotune/trace_metadata` | goal, outcome, note, reason, metadata |
| `autotune/tool_call` | normalized tool call |
| `autotune/tool_result` | normalized tool result |
| `autotune/annotation` | human or LLM annotation |
| `autotune/reward` | reward signal |
| `autotune/derivation` | how a curated session was derived |
| `autotune/source_sessions` | list of source trace ids for a merge |

Normalization rule for V0:

- normalize the common concepts we need for capture and merge
- preserve provider-specific detail in `autotune/*` custom entries instead of aggressively flattening it away

That means V0 should favor lossless normalization over a perfectly uniform abstraction.

### 2.4 Index

A flat JSON file per project (`index.json`) for session lookup. Session content
stays in JSONL files. The index stores:

- session entries keyed by trace id (harness, provider, model, outcome, path,
  created_at, goal, reason, note, metadata, resolution, confidence)
- provenance links (source trace ids → merged trace id)

The index is small in V0 — loaded entirely into memory, written back atomically.
If it outgrows this approach later, it can be migrated to SQLite without
changing the CLI contract or storage layout.

**Concurrency rule**:

- use a per-project lockfile for `index.json` updates
- read the current index
- write the updated index to a temp file
- atomically rename the temp file into place
- use a short bounded retry loop when the lock is held
- if the lock cannot be acquired within the retry window, return exit code 7

**Index file shape** (`index.json`):

```json
{
  "version": 1,
  "sessions": {
    "trace_V1StGXR8_Z5j": {
      "harness": "codex",
      "provider": null,
      "model": null,
      "sessionId": "019d36d5-3108-7821-8380-1f072241a113",
      "resolution": "env:CODEX_THREAD_ID",
      "confidence": "high",
      "outcome": "failed",
      "goal": "fix the auth bug",
      "reason": "patched the wrong file",
      "note": null,
      "kind": "captured",
      "filePath": "traces/trace_V1StGXR8_Z5j.jsonl",
      "createdAt": "2026-03-30T00:00:00Z"
    }
  },
  "links": [
    {
      "sourceId": "trace_V1StGXR8_Z5j",
      "targetId": "trace_Xk9mQ2wL_p4r",
      "linkType": "merged_into",
      "createdAt": "2026-03-30T01:00:00Z"
    }
  ]
}
```

### 2.5 Merge backend

PI coding agent is the single merge backend in V0. No pluggable merge-adapter
abstraction. `autotune setup` always ensures PI is installed globally via:

```bash
npm install -g @mariozechner/pi-coding-agent
```

The installed binary is `pi`.

### 2.6 Capture dedupe policy

V0 should dedupe captures only when the source session identity is strong.

Rule:

- if a trace with the same `harness + sessionId` already exists, return the existing trace id instead of creating a duplicate
- if no stable `sessionId` is available, create a new trace

This keeps dedupe simple and predictable in V0.

### 2.6.1 Future dataset source rule

When export commands are added later:

- prefer merged traces as dataset inputs
- use captured traces only when no merged trace exists for that session/problem cluster

This is why the storage shape is flat and the distinction lives in metadata/index fields instead of separate `raw/` and `curated/` directories.

### 2.7 Error JSON contract

All commands should return a stable JSON shape on failure.

Suggested shape:

```json
{
  "ok": false,
  "error": {
    "code": "SESSION_UNRESOLVED",
    "message": "Could not resolve a Claude Code session from the current context.",
    "details": {},
    "retryable": false
  }
}
```

Suggested error codes:

- `INVALID_ARGS`
- `UNSUPPORTED_COMPONENT`
- `SESSION_UNRESOLVED`
- `SETUP_REQUIRED`
- `MERGE_FAILED`
- `STORAGE_WRITE_FAILED`

Suggested exit-code mapping:

| Error code | Exit code |
|---|---|
| `INVALID_ARGS` | 2 |
| `UNSUPPORTED_COMPONENT` | 3 |
| `SESSION_UNRESOLVED` | 4 |
| `SETUP_REQUIRED` | 5 |
| `MERGE_FAILED` | 6 |
| `STORAGE_WRITE_FAILED` | 7 |

---

## 3. V0 CLI Commands

Four commands. Nothing else until these work end-to-end.

### 3.1 Output mode

All commands return machine-readable JSON by default.

### 3.1.1 Project resolution rule

V0 intentionally does not expose global `--project`, `--cwd`, or `--verbose`
flags.

Commands resolve the active project by walking up from the current working
directory to the nearest registered project root.

### 3.2 Exit codes

| Code | Meaning |
|---|---|
| 0 | success |
| 2 | invalid arguments |
| 3 | unsupported harness/component |
| 4 | session could not be resolved |
| 5 | required setup missing |
| 6 | merge failed |
| 7 | storage or index write failed |

### 3.3 `autotune init`

Initialize a project store for the current working directory.

```bash
autotune init
```

Behavior:

1. Compute project slug from cwd basename + hash
2. Create `~/.autotune/projects/<slug>/` with subdirectories and config
3. Create empty `index.json` with version field
4. Register the project in `~/.autotune/registry/projects.json`
5. Print the project path and next steps

**Idempotency**: If the project already exists (directory + registry entry),
`init` prints the existing project info and exits 0. It does not re-create
directories or overwrite config. It updates `updatedAt` in the registry entry
only. This makes it safe for agents to call `init` defensively before capture.

Flags:

- `--yes` — skip confirmation

Registry entry shape:

```json
{
  "cwd": "/absolute/path",
  "projectId": "uuid",
  "projectSlug": "myrepo--a1b2c3d4",
  "projectHash": "a1b2c3d4",
  "storePath": "~/.autotune/projects/myrepo--a1b2c3d4",
  "createdAt": "2026-03-30T00:00:00Z",
  "updatedAt": "2026-03-30T00:00:00Z"
}
```

### 3.4 Trace id format

All trace ids follow the pattern `trace_<nanoid-12>`.

- Prefix: `trace_`
- Suffix: 12-character nanoid using the default alphabet (`A-Za-z0-9_-`)
- Example: `trace_V1StGXR8_Z5j`

Merged traces use the same format (not a separate `trace_merge_` prefix).
The `kind` field in `index.json` distinguishes captured from merged traces.

### 3.5 Resolution confidence levels

When `autotune capture` resolves a session, it assigns a confidence level to
the resolution method:

| Level | Meaning | Examples |
|---|---|---|
| `high` | Explicit id or env var matched a known session | `--session <id>`, `CODEX_THREAD_ID`, `HERMES_SESSION_ID` |
| `medium` | Matched via local store or export command with a single unambiguous result | cwd match in `~/.codex/sessions/`, `opencode export`, `hermes sessions export` |
| `low` | Heuristic match, multiple candidates, or PID-based lookup | PID-based Claude Code session lookup, most-recent-file heuristic |

If confidence is `low`, capture still succeeds but the JSON output must include
that low confidence explicitly so the caller can decide what to do next.

### 3.6 `autotune setup`

Install the default instruction/helper bundle for one or more harnesses.

**Interactive mode** (human):

```bash
autotune setup
```

1. Detect installed/supported harnesses
2. Show a multiselect of harnesses
3. Confirm before writing files outside the repo
4. Install the default bundle for each selected harness
5. Print verification commands

**Non-interactive mode** (agents/scripts):

```bash
autotune setup --harness codex --harness claude-code --yes
autotune setup --harness hermes --yes
```

PI is always installed/configured as part of every `autotune setup` run. It is
not an optional public component in V0.

Flags:

| Flag | Purpose |
|---|---|
| `--harness <name>` | repeatable, target harness |
| `--yes` | skip prompts |

Harness/default bundle matrix:

| Harness | Installed by default |
|---|---|
| Codex | `skill` |
| Claude Code | user-level `command`, user-level hook helper |
| OpenCode | user-level `skill`, user-level session env plugin |
| Hermes | user-level `skill`, user-level session env plugin |
| Global | `pi-agent` |

Output:

```json
{
  "ok": true,
  "installed": [
    { "component": "pi-agent", "target": "global", "package": "@mariozechner/pi-coding-agent" },
    { "harness": "claude-code", "component": "instruction", "target": "~/.claude/commands/autotune-capture.md" },
    { "harness": "claude-code", "component": "helper", "target": "~/.claude/settings.json" }
  ],
  "skipped": [],
  "nextSteps": ["restart Claude Code", "verify /autotune-capture is available"]
}
```

### 3.7 `autotune capture`

Resolve a provider session, ingest it, normalize it, store it as a raw trace.

```bash
autotune capture --harness <name> [options]
```

Examples:

```bash
autotune capture --harness codex
autotune capture --harness codex --session "$CODEX_THREAD_ID"
autotune capture --harness hermes --outcome failed
autotune capture --harness claude-code --transcript-path /path/to/transcript.jsonl
```

Flags:

| Flag | Purpose |
|---|---|
| `--harness <name>` | required |
| `--session <id>` | explicit session id |
| `--trace-file <path>` | direct file import |
| `--transcript-path <path>` | provider transcript file |
| `--goal <text>` | what the agent was trying to do |
| `--outcome <value>` | `failed`, `partial`, `successful`, `unknown` |
| `--reason <text>` | why the trace is being captured / what went wrong |
| `--note <text>` | freeform annotation |
| `--metadata <json>` | optional JSON object for extra capture metadata |

**Session resolution order** (per harness):

1. Explicit flags (`--session`, `--trace-file`)
2. Harness-specific env vars
3. Harness-specific local export/session stores
4. Configured hook/plugin registries
5. Documented heuristics

**Harness-specific resolvers**:

| Harness | Primary | Secondary | Fallback |
|---|---|---|---|
| Codex | `CODEX_THREAD_ID` env | session JSONL by `session_meta.payload.id` | cwd match in `~/.codex/sessions/` |
| Claude Code | `--session` / `--transcript-path` | hook/registry metadata | PID-based session lookup |
| OpenCode | explicit session id | `opencode export` command | plugin/SDK session lookup |
| Hermes | `HERMES_SESSION_ID` env (requires plugin) | explicit session id | `hermes sessions export` |

Output:

```json
{
  "ok": true,
  "traceId": "trace_abc123",
  "harness": "codex",
  "sessionId": "019d36d5-3108-7821-8380-1f072241a113",
  "resolution": { "method": "env:CODEX_THREAD_ID", "confidence": "high" },
  "storedPath": "~/.autotune/projects/autotune--a1b2c3d4/traces/trace_abc123.jsonl"
}
```

### 3.8 `autotune merge`

Take one or more captured traces, produce an idealized merged trace via PI.

```bash
autotune merge --trace <id> [--trace <id> ...]
```

Key rule: merge operates on stored trace ids, not raw harness/session ids.
Provenance is already bound during capture.

- 1 trace: idealize/clean a single trace
- 2+ traces: merge into one idealized trajectory

Examples:

```bash
autotune merge --trace trace_a
autotune merge --trace trace_a --trace trace_b --trace trace_c
autotune merge --traces-file traces.json
```

Flags:

| Flag | Purpose |
|---|---|
| `--trace <id>` | repeatable |
| `--traces-file <path>` | manifest file |
| `--note <text>` | merge annotation |

Traces file shape:

```json
{
  "traces": ["trace_a", "trace_b"],
  "merge": { "backend": "pi", "note": "prefer successful path" }
}
```

Merge behavior:

1. Validate all trace ids exist in the project store
2. Load normalized trace content + provenance metadata
3. Invoke PI coding agent with a merge prompt
4. Parse PI's output session
5. Store result in `traces/`
6. Record provenance links back to every input trace in `index.json`

**PI integration contract**:

PI coding agent is invoked as a Node subprocess via its CLI or programmatic API
(whichever `pi-mono` exposes at implementation time — inspect the installed
package during Phase 5).

For V0, do not pass a model override from Autotune. PI should use its own
configured/default model. If PI is installed but not configured well enough to
run, the merge command should surface the PI error directly to the caller.

Input to PI:

- A temporary directory containing the source trace JSONL files
- A system prompt constructed by `src/merge/prompt.ts` that includes:
  - the merge policy (section 8)
  - the list of source traces with their provenance metadata
  - instructions to produce a single merged session JSONL as output
  - instruction to mark any synthetic/reconstructed steps explicitly

Output from PI:

- A PI Mono-compatible session JSONL (same format as captured traces)
- The orchestrator reads this output, adds `autotune/derivation` and
  `autotune/source_sessions` custom entries, then writes to `traces/`

If PI fails or produces unparseable output, exit code 6.

The exact PI CLI invocation and API surface must be determined during Phase 5
by inspecting the installed `pi-mono` package. The orchestrator should abstract
this behind `src/merge/pi-backend.ts` so swapping the invocation method later
does not touch the rest of the merge flow.

Output:

```json
{
  "ok": true,
  "mergedTraceId": "trace_V1StGXR8_Z5j",
  "sourceTraceIds": ["trace_a", "trace_b", "trace_c"],
  "backend": "pi",
  "storedPath": "~/.autotune/projects/autotune--a1b2c3d4/traces/trace_V1StGXR8_Z5j.jsonl"
}
```

---

## 4. Codebase Structure

```
autotune/
  package.json
  tsconfig.json
  src/
    index.ts                         # entry point, CLI router
    cli/
      init.ts                        # autotune init
      setup.ts                       # autotune setup
      capture.ts                     # autotune capture
      merge.ts                       # autotune merge
      shared.ts                      # shared command helpers and JSON output formatting
    core/
      project.ts                     # project creation, registry, slug computation
      storage.ts                     # read/write sessions, manage directories
      index.ts                       # index.json read/write/query
      trace-id.ts                    # trace id generation
      config.ts                      # global and project config management
    format/
      pi-session.ts                  # PI Mono session JSONL reader/writer
      normalizer.ts                  # provider-native → autotune normalized entries
      custom-entries.ts              # autotune/* custom entry type definitions
    adapters/
      types.ts                       # adapter interface
      codex.ts                       # Codex session resolver + importer
      claude-code.ts                 # Claude Code transcript resolver + importer
      opencode.ts                    # OpenCode session resolver + importer
      hermes.ts                      # Hermes session resolver + importer
    setup/
      types.ts                       # setup component interface
      detect.ts                      # harness detection logic
      pi-agent.ts                    # PI agent install/config
      codex-skill.ts                 # Codex skill installer
      claude-code-command.ts         # Claude Code command installer
      claude-code-subagent.ts        # Claude Code subagent installer
      opencode-skill.ts              # OpenCode skill installer
      hermes-skill.ts                # Hermes skill installer
      hermes-session-env-plugin.ts   # Hermes session-env plugin installer
    merge/
      orchestrator.ts                # merge workflow: validate → load → invoke PI → store
      pi-backend.ts                  # PI coding agent integration
      prompt.ts                      # merge prompt construction
  assets/
    skills/
      codex/
        autotune-capture/
          SKILL.md
      opencode/
        autotune-capture/
          SKILL.md
      hermes/
        autotune-capture/
          SKILL.md
    commands/
      claude-code/
        autotune-capture.md
    agents/
      claude-code/
        autotune-capture.md
    plugins/
      hermes/
        session-env/
          plugin.yaml
          __init__.py
  tests/
    cli/
      init.test.ts
      setup.test.ts
      capture.test.ts
      merge.test.ts
    core/
      project.test.ts
      storage.test.ts
      index.test.ts
    format/
      pi-session.test.ts
      normalizer.test.ts
    adapters/
      codex.test.ts
      claude-code.test.ts
      opencode.test.ts
      hermes.test.ts
    merge/
      orchestrator.test.ts
    fixtures/
      codex-session.jsonl
      claude-code-transcript.jsonl
      hermes-session.json
      opencode-session.json
```

---

## 5. Dependencies

| Package | Purpose |
|---|---|
| `commander` | CLI argument parsing |
| `inquirer` | interactive prompts (setup) |
| `nanoid` | trace id generation |
| `tsx` | TypeScript execution (dev) |
| `vitest` | testing |
| `typescript` | compilation |

No framework. No ORM. No bundler beyond tsc. Keep it simple.

---

## 6. Implementation Phases

### Phase 1: Skeleton + Core Data Model

**Goal**: Working `autotune init`, project resolution, and storage primitives.

Tasks:

1. Initialize npm project with TypeScript, vitest, commander
2. Implement `src/core/project.ts`
   - slug computation (basename + sha256 hash of abs cwd)
   - project directory creation
   - registry read/write (`~/.autotune/registry/projects.json`)
   - project resolution by walking up from the current working directory to the nearest registered project root
3. Implement `src/core/index.ts`
   - Read/write `index.json` atomically (write to temp file, rename)
   - Use a per-project lockfile with bounded retry
   - Add/get/list session entries
   - Add/query provenance links
4. Implement `src/core/storage.ts`
   - Create/read session directories
   - Write/read JSONL files
5. Implement `src/format/pi-session.ts`
   - Write session header
   - Append entries
   - Read and parse session files
6. Implement `src/format/custom-entries.ts`
   - TypeScript types for all `autotune/*` custom entry types
7. Implement `src/cli/init.ts` and wire into `src/index.ts`
8. Tests for all of the above

**Exit criteria**: `autotune init` creates the full project directory structure,
creates `index.json`, registers the project, and `autotune init` in the same
directory is idempotent.

### Phase 2: Capture — First Adapter (Codex)

**Goal**: Working `autotune capture --harness codex` end-to-end.

Tasks:

1. Implement `src/adapters/types.ts`
   - `HarnessAdapter` interface: `resolve(options) → SessionResolution`, `import(resolution) → NormalizedEntries`
2. Implement `src/adapters/codex.ts`
   - Resolution chain: explicit `--session` → `CODEX_THREAD_ID` env → cwd match in `~/.codex/sessions/`
   - Session JSONL parser (read Codex session format, extract messages + tool calls)
   - Normalizer: Codex entries → PI Mono-compatible entries with `autotune/*` custom types
3. Implement `src/format/normalizer.ts`
   - Common normalization logic shared across adapters
4. Implement `src/core/trace-id.ts`
   - Generate `trace_<nanoid>` ids
5. Implement `src/cli/capture.ts`
   - Parse flags
   - Resolve project
   - Call adapter.resolve → adapter.import
   - Apply dedupe rule (`harness + sessionId` when available)
   - Write session JSONL to `traces/`
   - Insert session entry in `index.json`
   - Print JSON output
6. Wire `capture` command into `src/index.ts`
7. Tests with fixture Codex session files

**Exit criteria**: `autotune capture --harness codex` inside a directory with a
Codex session produces a stored captured trace, indexed in `index.json`, with correct
provenance metadata.

### Phase 3: Capture — Remaining 3 Adapters

**Goal**: Claude Code, OpenCode, and Hermes adapters working. This phase covers
trace import/normalization only — the agent-facing instruction surfaces (skills,
commands, subagents) are installed in Phase 4.

Tasks (parallelize where possible):

1. `src/adapters/claude-code.ts`
   - Resolution: explicit args → hook/registry → PID heuristic
   - Transcript JSONL parser
2. `src/adapters/opencode.ts`
   - Resolution: explicit session → `opencode export` → plugin/SDK
   - JSON session parser
3. `src/adapters/hermes.ts`
   - Resolution: `HERMES_SESSION_ID` env → explicit → `hermes sessions export` → local files
   - Session JSON/export parser
4. Tests for each adapter with fixture data

**Exit criteria**: `autotune capture --harness <name>` works for all four V0
harnesses with at least the explicit-session and file-import resolution paths.
Agents cannot yet discover Autotune on their own — that requires Phase 4.

### Phase 4: Setup (Harness Instruction + Helper Installs)

**Goal**: Working `autotune setup` for all harnesses and components. After this
phase, agents inside each harness can discover and invoke Autotune via their
native skill/command/subagent surfaces.

Tasks:

1. Implement `src/setup/detect.ts`
   - Detect installed harnesses by checking known paths/binaries
2. Implement `src/setup/types.ts`
   - `SetupComponent` interface: `detect() → boolean`, `install(options) → result`, `verify() → boolean`
3. Create asset files in `assets/`
   - Skill files for Codex, OpenCode, Hermes
   - Command + subagent files for Claude Code
   - Hermes session-env plugin files (plugin.yaml + __init__.py)
4. Implement setup installers for each component
   - Copy/template asset files to correct harness-specific directories
   - Skip if the component already exists
5. Implement `src/setup/pi-agent.ts`
   - Check if `pi --version` works
   - Install with `npm install -g @mariozechner/pi-coding-agent` if missing
   - Verify the `pi` binary is available after install
6. Implement `src/cli/setup.ts`
   - Interactive mode: detect → prompt → install → verify
   - Non-interactive mode: validate flags → install → output
7. Wire into `src/index.ts`
8. Tests

**Exit criteria**: Both interactive and non-interactive setup work. Skill files
land in the correct directories. Hermes plugin installs correctly. PI agent
installation works.

### Phase 5: Merge

**Goal**: Working `autotune merge` using PI coding agent.

Tasks:

1. Implement `src/merge/pi-backend.ts`
   - Invoke PI coding agent as a subprocess or via its Node API
   - Pass source trace content and merge instructions
   - Receive merged output
2. Implement `src/merge/prompt.ts`
   - Construct the merge prompt from source traces
   - Include provenance, metadata, and merge guidelines
   - Handle single-trace idealization vs multi-trace merge
3. Implement `src/merge/orchestrator.ts`
   - Validate trace ids exist
   - Load traces from `traces/`
   - Call PI backend
   - Write result to `traces/`
   - Record provenance links in `index.json`
4. Implement `src/cli/merge.ts`
   - Parse flags (--trace, --traces-file, --note)
   - Call orchestrator
   - Output result
5. Wire into `src/index.ts`
6. Tests with fixture traces

**Exit criteria**: `autotune merge --trace trace_a --trace trace_b` produces a
merged trace in `traces/`, with provenance links in
`index.json` pointing back to both source traces.

### Phase 6: Polish + Distribution

**Goal**: Installable, documented, usable CLI.

Tasks:

1. Add `bin` field to `package.json` for global `autotune` command
2. Build step (tsc) producing `dist/`
3. Ensure `npm install -g` or `npx autotune` works
4. Add `--help` text for all commands and subcommands
5. Add `--version` flag
6. Error handling: consistent error messages, correct exit codes
7. Edge cases: missing project (suggest `autotune init`), missing setup
   (suggest `autotune setup`), ambiguous session resolution (return low-confidence
   JSON with guidance)
8. End-to-end integration test: init → setup → capture → merge
9. Add a minimal README with install + usage

**Exit criteria**: A user can `npm install -g autotune`, run the full
init → setup → capture → merge flow, and get a curated trace.

---

## 7. Harness Setup & Instruction Specs

Each harness gets native instruction files installed by `autotune setup`.
This section defines the exact files, content structure, install paths, and
verification steps for every V0 harness.

### 7.1 Shared workflow core

All instruction files embed the same behavioral core:

1. When the agent is clearly failing, run `autotune capture`
2. When multiple related traces exist, run `autotune merge`
3. Prefer explicit session id if available
4. Otherwise use the harness-specific resolver
5. If no high-confidence resolver works, ask the user or annotate as unresolved
6. Attach metadata: `--outcome`, `--reason`, `--goal`, `--note`
7. When merging, pass stored trace ids (provenance is already inside them)

### 7.2 Codex — `skill` component

**Surface**: `SKILL.md` with YAML frontmatter + markdown body.

**Install path**: `~/.codex/skills/autotune-capture/SKILL.md`

**Template content**:

```yaml
---
name: autotune-capture
description: Capture the current Codex session as an Autotune trace for curation and training data generation.
---
```

```markdown
## When to use

Run this skill when the current coding task has clearly failed, produced a
wrong result, or you want to preserve the session for later curation.

## Steps

1. Run the capture command. The CLI reads `CODEX_THREAD_ID` from the
   environment automatically — do not pass `--session` when it is set:
   ```bash
   autotune capture --harness codex \
     --outcome <failed|partial|successful|unknown> \
     --goal "<what you were trying to do>" \
     --reason "<what went wrong>"
   ```
   If `CODEX_THREAD_ID` is not set, ask the user for the session id and
   pass it explicitly with `--session <id>`.
2. If the capture succeeds, report the trace id to the user.
3. If the user wants to merge this trace with others, run:
   ```bash
   autotune merge --trace <trace-id-1> --trace <trace-id-2>
   ```

## Notes

- Use `--note` for any extra context that does not fit cleanly into `--goal`,
  `--outcome`, or `--reason`.
```

**Installer behavior** (`autotune setup --harness codex --component skill`):

1. Create `~/.codex/skills/autotune-capture/` if it does not exist
2. Write `SKILL.md` from the bundled asset template
3. If the file already exists, skip and report

**Verification**: User asks Codex to use the `autotune-capture` skill and
confirms Codex can find and execute it.

### 7.3 Claude Code — default bundle

Claude Code does not use `SKILL.md` as its primary reusable instruction surface.
The V0 setup bundle therefore installs:

- a user-level slash command
- a user-level SessionStart hook helper that records session metadata for Autotune

**Slash command install path**: `~/.claude/commands/autotune-capture.md`

**Template content**:

```markdown
Capture the current Claude Code session as an Autotune trace.

## Instructions

You are being invoked because the user wants to capture this session for
Autotune trace curation.

1. Determine the session context:
   - If a transcript path is available, use `--transcript-path`.
   - If the user provided a session id, use `--session`.
   - Otherwise, inform the user that you will attempt automatic resolution from the installed Autotune hook registry.
2. Run the capture:
   ```bash
   autotune capture --harness claude-code \
     --outcome <failed|partial|successful|unknown> \
     --goal "<what you were trying to do>" \
     --reason "<what went wrong>" $ARGUMENTS
   ```
3. Report the resulting trace id.
4. If the user wants to merge traces:
   ```bash
   autotune merge --trace <trace-id-1> --trace <trace-id-2>
   ```

`$ARGUMENTS` can include additional flags or a short failure description.
```

**Hook helper install path**:

`~/.autotune/helpers/claude-code-session-registry.py`

**Hook settings path**:

`~/.claude/settings.json`

**Installer behavior** (`autotune setup --harness claude-code --yes`):

1. Create `~/.claude/commands/` if it does not exist
2. Write `autotune-capture.md` from the bundled asset template
3. Write `~/.autotune/helpers/claude-code-session-registry.py`
4. Merge a `SessionStart` hook into `~/.claude/settings.json` that runs the helper
5. If a generated file already exists, skip and report

**Verification**: User types `/autotune-capture` in Claude Code and sees the
command listed, then starts a new Claude Code session and verifies the helper has
written `~/.autotune/runtime/claude-code-session.json`.

### 7.4 OpenCode — default bundle

OpenCode's default bundle installs:

- a user-level `SKILL.md`
- a user-level plugin that exposes `OPENCODE_SESSION_ID` to shell calls

**Skill install path**: `~/.config/opencode/skills/autotune-capture/SKILL.md`

**Plugin install path**: `~/.config/opencode/plugins/autotune-session-env.js`

**Template content**:

```yaml
---
name: autotune-capture
description: Capture the current OpenCode session as an Autotune trace for curation and training data generation.
---
```

```markdown
## When to use

Run this skill when the current task has failed or you want to preserve the
session for later curation.

## Steps

1. Determine the session id:
   - If `OPENCODE_SESSION_ID` is set, the CLI will read it automatically.
   - If you know the current OpenCode session id, use it directly.
   - Otherwise, run `opencode export` to list available sessions.
2. Run the capture command:
   ```bash
   autotune capture --harness opencode \
     --outcome <failed|partial|successful|unknown> \
     --goal "<what you were trying to do>" \
     --reason "<what went wrong>"
   ```
   If `OPENCODE_SESSION_ID` is not set, pass `--session "<session-id>"` explicitly.
3. If the capture succeeds, report the trace id to the user.
4. If the user wants to merge traces:
   ```bash
   autotune merge --trace <trace-id-1> --trace <trace-id-2>
   ```

## Notes

- OpenCode's `opencode export <sessionID>` can be used to get session data
  if direct id resolution fails.
- Use `--note` for any extra context that does not fit cleanly into `--goal`,
  `--outcome`, or `--reason`.
```

**Installer behavior** (`autotune setup --harness opencode --yes`):

1. Create `~/.config/opencode/skills/autotune-capture/` if it does not exist
2. Write `SKILL.md` from the bundled asset template
3. Create `~/.config/opencode/plugins/` if it does not exist
4. Write `autotune-session-env.js` from the bundled asset template
5. If a generated file already exists, skip and report

**Verification**: User invokes the `autotune-capture` skill inside OpenCode and
confirms `echo $OPENCODE_SESSION_ID` works inside an OpenCode shell/tool call.

### 7.5 Hermes — default bundle

Hermes's default bundle installs:

- a user-level `SKILL.md`
- the `session-env` plugin under `~/.hermes/plugins/`

**Skill install path**: `~/.hermes/skills/autotune-capture/SKILL.md`

**Template content**:

```yaml
---
name: autotune-capture
description: Capture the current Hermes session as an Autotune trace for curation and training data generation.
version: "1.0"
required_environment_variables:
  - HERMES_SESSION_ID
---
```

```markdown
## When to use

Run this skill when the current task has failed or you want to preserve the
session for later curation.

## Prerequisites

The `session-env` plugin must be installed so that `HERMES_SESSION_ID` is
available. If it is missing, tell the user to run:
```bash
autotune setup --harness hermes --component session-env-plugin --yes
```

## Steps

1. Determine the session id:
   - If `HERMES_SESSION_ID` is set, use it.
   - Otherwise, ask the user or run
     `hermes sessions export <id>` to find it.
2. Run the capture command:
   ```bash
   autotune capture --harness hermes \
     --outcome <failed|partial|successful|unknown> \
     --goal "<what you were trying to do>" \
     --reason "<what went wrong>"
   ```
   If `HERMES_SESSION_ID` is not set, pass `--session <id>` explicitly.
3. Report the trace id to the user.
4. If the user wants to merge traces:
   ```bash
   autotune merge --trace <trace-id-1> --trace <trace-id-2>
   ```
```

**Installer behavior** (`autotune setup --harness hermes --yes`):

1. Create `~/.hermes/skills/autotune-capture/` if it does not exist
2. Write `SKILL.md` from the bundled asset template
3. Create `~/.hermes/plugins/session-env/` if it does not exist
4. Write `plugin.yaml` and `__init__.py` from bundled asset templates
5. If a generated file already exists, skip and report

**Verification**: Start a new Hermes session, run `echo $HERMES_SESSION_ID`,
confirm it outputs a session id like `20260329_160430_58122c`.

Full details in [hermes-session-id-plugin.md](../hermes-session-id-plugin.md).

### 7.6 Summary table

| Harness | Bundle contents | Surface | Install path | Extra setup |
|---|---|---|---|---|
| Codex | `skill` | `SKILL.md` | `~/.codex/skills/autotune-capture/SKILL.md` | none |
| Claude Code | `instruction`, `helper` | command markdown + SessionStart hook helper | `~/.claude/commands/autotune-capture.md`, `~/.claude/settings.json` | restart Claude Code |
| OpenCode | `instruction`, `helper` | `SKILL.md` + plugin | `~/.config/opencode/skills/autotune-capture/SKILL.md`, `~/.config/opencode/plugins/autotune-session-env.js` | restart OpenCode |
| Hermes | `instruction`, `helper` | `SKILL.md` + Python plugin | `~/.hermes/skills/autotune-capture/SKILL.md`, `~/.hermes/plugins/session-env/` | restart Hermes |

---

## 8. Merge Policy

### Allowed

- Merge multiple attempts into a curated idealized trajectory
- Fill in metadata gaps
- Summarize noisy tool chatter
- Normalize provider-specific message shapes

### Not allowed

- Silently overwrite raw traces (raw traces are immutable)
- Drop provenance
- Present generated steps as if they came from the original session

If the LLM invents missing steps, those steps must be marked as synthetic
in derivation metadata.

---

## 9. Provenance Model

### Forward: curated session → sources

Every curated/merged session includes an `autotune/source_sessions` custom entry
listing all captured trace ids it was derived from, plus an `autotune/derivation`
entry recording the merge backend, model, and derivation type.

### Reverse: captured trace → merged traces

The `links` array in `index.json` records edges:

- `merged_into` (source captured trace → target merged trace)

This supports answering: "which captured traces were merged into this merged trace?"
and "what merged traces depend on this captured trace?"

Additional link types (`export_derived_from`, etc.) will be added when export
commands are implemented post-V0.

---

## 10. Testing Strategy

- **Unit tests**: core modules (project, storage, index, pi-session, normalizer, trace-id)
- **Adapter tests**: each adapter with fixture session files
- **CLI tests**: each command with mocked adapters, verifying output and exit codes
- **Integration test**: full init → capture → merge flow against fixture data

Test runner: vitest.

---

## 11. What Is Deferred

These are explicitly out of scope for V0:

| Feature | Deferred to |
|---|---|
| `autotune trace list` / `trace show` | Post-V0 (trace ids come from capture output in V0) |
| `autotune export sft` / `preference` / `rl` | Post-V0 |
| `autotune trace start` / `append` / `link` | Post-V0 |
| `autotune annotate` (standalone command) | Post-V0 |
| `autotune train run` | Post-V0 |
| `autotune synthesize` | Post-V0 |
| `autotune sync push` (hosted) | Post-V0 |
| Hosted storage, Postgres, object storage | Post-V0 |
| Redaction/sanitization pipeline | Post-V0 |
| Data marketplace | Post-V0 |
| Pluggable merge backends | Post-V0 |
| Real-time RL loop | Post-V0 |
| Verifier-backed scoring | Post-V0 |
| Agent Lightning / Fireworks integration | Post-V0 |
| Repo-local `.autotune/` pointer file | Post-V0 (optional) |
| OpenClaw adapter + setup | Post-V0 |
| Task/attempt first-class entities | Post-V0 (derived from trace groups) |
| Setup-generated file overwrite/update semantics (`--force` or equivalent) | Post-V0 |

---

## 12. Provider Priority Order

For implementation sequencing within Phase 2 and Phase 3:

1. **Codex** — `CODEX_THREAD_ID` env, local JSONL sessions, richest local data
2. **Claude Code** — huge user base, `transcript_path` via hooks
3. **OpenCode** — official `opencode export`, clean plugin/SDK
4. **Hermes** — `hermes sessions export`, plugin-based env injection

Codex is first because it has the most accessible local session data for
development and testing.

---

## 13. Key Design Constraints

1. **Capture-first, not task-first.** No `task create` before capture. Traces
   stand alone; grouping is derived later.
2. **Raw traces are immutable.** Merge produces new curated sessions; raw
   sessions are never modified after capture.
3. **Provenance is never dropped.** Every curated session links back to its
   sources. Every synthetic step is marked.
4. **One merge backend in V0.** PI coding agent only. No adapter abstraction
   for merge.
5. **Setup is dual-mode.** Every setup flow works both interactively (humans)
   and non-interactively (agents/scripts with `--yes`).
6. **Harness-native instruction surfaces.** Use each harness's native skill/
   command/subagent format instead of forcing a universal file format.
7. **Global storage, not repo-local.** Traces live under `~/.autotune/`, not
   inside the repo.

---

## 14. Build Sequence Summary

```
Phase 1  ─  Skeleton + Core Data Model
             autotune init works
                  │
Phase 2  ─  Capture (Codex adapter)
             autotune capture --harness codex works
                  │
Phase 3  ─  Capture (remaining 3 adapters)
             all 4 harness adapters import traces correctly
                  │
Phase 4  ─  Setup (harness instruction + helper installs)
             autotune setup works; agents can discover and invoke Autotune
                  │
Phase 5  ─  Merge
             autotune merge works end-to-end
                  │
Phase 6  ─  Polish + Distribution
             npm installable, full flow works
```

Each phase has a clear exit criteria. Do not start the next phase until the
current one's exit criteria are met.
