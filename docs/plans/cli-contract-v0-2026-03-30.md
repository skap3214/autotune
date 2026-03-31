# Autotune CLI Contract V0

Date: 2026-03-30

Related:

- [PI Mono-Based Trace Platform Plan](/Users/soami/Desktop/code/int/autotune/docs/plans/pi-mono-trace-plan-2026-03-29.md)
- [Provider Trace Capture Research](/Users/soami/Desktop/code/int/autotune/docs/research/provider-trace-capture-2026-03-29.md)
- [Harness Instruction Surfaces Research](/Users/soami/Desktop/code/int/autotune/docs/research/harness-instruction-surfaces-2026-03-29.md)

## Goal

Define the exact V0 contract for the three core commands:

- `autotune setup`
- `autotune capture`
- `autotune merge`

## Design Principles

### 1. Setup is dual-mode

Every setup flow must support:

- interactive use by humans
- deterministic flag-driven use by agents and harnesses

### 2. Capture binds provenance

`autotune capture` is the command that attaches:

- harness
- provider
- session id
- resolution method
- source transcript or export details

to the stored trace.

That means `autotune merge` should usually work on stored trace ids, not raw session ids.

### 3. Merge uses one backend in V0

Use PI coding agent as the only merge backend in V0.

No merge-adapter abstraction per harness in V0.

## Common CLI Behavior

### Output mode

All commands return machine-readable JSON by default.

### Project resolution rule

V0 intentionally does not expose global `--project`, `--cwd`, or `--verbose`
flags.

Commands resolve the active project by walking up from the current working
directory to the nearest registered project root.

### Exit codes

Suggested stable exit codes:

- `0` success
- `2` invalid arguments
- `3` unsupported harness/component
- `4` session could not be resolved
- `5` required setup missing
- `6` merge failed
- `7` storage or index write failed

### Error code mapping

| Error code | Exit code |
|---|---|
| `INVALID_ARGS` | 2 |
| `UNSUPPORTED_COMPONENT` | 3 |
| `SESSION_UNRESOLVED` | 4 |
| `SETUP_REQUIRED` | 5 |
| `MERGE_FAILED` | 6 |
| `STORAGE_WRITE_FAILED` | 7 |

### Error shape

All commands should return a stable JSON error object on failure.

```json
{
  "ok": false,
  "error": {
    "code": "SESSION_UNRESOLVED",
    "message": "Could not resolve a session from the current context.",
    "details": {},
    "retryable": false
  }
}
```

## `autotune setup`

### Purpose

Install the default instruction/helper bundle for one or more harnesses.

### Interactive form

```bash
autotune setup
```

### Non-interactive form

```bash
autotune setup --harness codex --harness claude-code --yes
autotune setup --harness hermes --yes
```

### Supported flags

- `--harness <name>` repeatable
- `--yes`

### Interactive behavior

When run without `--harness`:

1. detect supported harnesses and existing installs
2. show a harness multiselect
3. confirm before writing outside the repo
4. install the default bundle for each selected harness
6. print verification commands

### Non-interactive behavior

When run with one or more `--harness` flags:

1. validate the requested harness list
2. install deterministically with no prompts if `--yes` is set
3. return structured success/failure output

PI is always installed/configured as part of `autotune setup`. It is not an optional public component in V0.

### Harness/default bundle matrix

- Codex
  - `skill`
- Claude Code
  - user-level `command`
  - user-level hook helper
- OpenCode
  - user-level `skill`
  - user-level session env plugin
- Hermes
  - user-level `skill`
  - user-level session env plugin

### Output shape

```json
{
  "ok": true,
  "installed": [
    { "component": "pi-agent", "target": "global", "package": "@mariozechner/pi-coding-agent" },
    { "harness": "claude-code", "component": "instruction", "target": "~/.claude/commands/autotune-capture.md" },
    { "harness": "claude-code", "component": "helper", "target": "~/.claude/settings.json" }
  ],
  "skipped": [],
  "nextSteps": [
    "restart Claude Code",
    "verify /autotune-capture is available"
  ]
}
```

## `autotune capture`

### Purpose

Resolve the current or specified provider session, ingest it, normalize it, and store it as a captured trace.

### Core contract

```bash
autotune capture --harness <name> [options]
```

### Examples

```bash
autotune capture --harness codex
autotune capture --harness codex --session "$CODEX_THREAD_ID"
autotune capture --harness hermes --outcome failed
autotune capture --harness opencode --session "<session-id>"
```

### Supported flags

- `--harness <name>` required unless auto-detection is explicitly supported later
- `--session <id>`
- `--trace-file <path>`
- `--transcript-path <path>`
- `--goal <text>`
- `--outcome <failed|partial|successful|unknown>`
- `--reason <text>`
- `--note <text>`
- `--metadata <json>`

### Resolution behavior

The command should try to resolve the session in this order:

1. explicit flags like `--session` or `--trace-file`
2. harness-specific env vars
3. harness-specific local export/session stores
4. configured hook/plugin registries
5. documented heuristics

### Harness-specific primary resolvers

- Codex
  - `CODEX_THREAD_ID`
  - local session JSONL by `session_meta.payload.id`
- Claude Code
  - explicit `--session` or transcript path
  - hook/registry metadata
  - documented PID/session fallback if needed
- OpenCode
  - explicit session id
  - `opencode export`
  - plugin/SDK session lookup
- Hermes
  - `HERMES_SESSION_ID` if setup plugin installed
  - explicit session id
  - `hermes sessions export`

### Dedupe rule

- if an existing trace has the same `harness + sessionId`, return that existing trace id
- if no stable `sessionId` is available, create a new trace

### Output

```json
{
  "ok": true,
  "traceId": "trace_abc123",
  "harness": "codex",
  "sessionId": "019d36d5-3108-7821-8380-1f072241a113",
  "resolution": {
    "method": "env:CODEX_THREAD_ID",
    "confidence": "high"
  },
  "storedPath": "~/.autotune/projects/autotune--a1b2c3d4/traces/trace_abc123.jsonl"
}
```

## `autotune merge`

### Purpose

Take one or more already-captured traces and produce an idealized merged trace using PI coding agent.

### Core contract

```bash
autotune merge --trace <trace-id> [--trace <trace-id> ...]
```

### Key simplification

Merge should operate on stored trace ids, not on raw harness/session ids.

Why:

- `capture` already binds harness/session provenance into the trace
- trace ids are simpler and less error-prone
- cross-harness merges still work because each stored trace already knows its source harness/session

### Minimum input

- allow `1+` traces

Interpretation:

- `1` trace: idealize/clean a single trace
- `2+` traces: merge multiple traces into one idealized trace

### Examples

```bash
autotune merge --trace trace_a
autotune merge --trace trace_a --trace trace_b --trace trace_c
autotune merge --traces-file traces.json
```

### Supported flags

- `--trace <trace-id>` repeatable
- `--traces-file <path>`
- `--note <text>`

### Optional advanced flags

These are not required for the default UX, but can exist later:

- `--merge-session <id>` if we want to resume or continue a PI merge session
- `--backend-path <path>` if PI is installed in a non-standard location

### Input file shape

```json
{
  "traces": ["trace_a", "trace_b", "trace_c"],
  "merge": {
    "backend": "pi",
    "note": "prefer the successful repair path"
  }
}
```

### Behavior

1. validate that all trace ids exist
2. load their normalized stored content plus provenance metadata
3. invoke PI coding agent with a merge prompt/workflow
4. produce an idealized merged trace
5. record provenance back to every input trace

### Output

```json
{
  "ok": true,
  "mergedTraceId": "trace_V1StGXR8_Z5j",
  "sourceTraceIds": ["trace_a", "trace_b", "trace_c"],
  "backend": "pi",
  "storedPath": "~/.autotune/projects/autotune--a1b2c3d4/traces/trace_V1StGXR8_Z5j.jsonl"
}
```

## Recommendation

V0 should implement exactly these three commands first:

- `autotune setup`
- `autotune capture`
- `autotune merge`

Everything else can wait until this loop is working end-to-end.
