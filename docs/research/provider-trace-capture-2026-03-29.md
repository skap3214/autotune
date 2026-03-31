# Provider Trace Capture Research

Date: 2026-03-29

Related:

- [PI Mono-Based Trace Platform Plan](/Users/soami/Desktop/code/int/autotune/docs/plans/pi-mono-trace-plan-2026-03-29.md)
- [Agentic Trace Collection and RL Feasibility](/Users/soami/Desktop/code/int/autotune/docs/research/agentic-trace-rl-feasibility-2026-03-28.md)

## Question

If a user is already deep in an agent session and only invokes Autotune when the model messes up, how can we capture the full agent trace from the provider correctly?

## Summary

Yes, this is workable, but the integration strategy differs by provider.

The common pattern is:

1. direct capture from inside the harness when the harness can pass session context
2. prefer official export or transcript APIs when available
3. fall back to official local transcript/session files
4. for live automation, use official hooks/plugins/event streams instead of scraping terminal output

## Integration Modes

Hooks are not mandatory.

There are really three capture modes:

### 1. Direct invocation from inside the harness

Best case.

If the agent runtime can call:

```bash
autotune capture --provider <provider> --session <id>
```

then we do not need a hook just to identify the session. The harness already knows enough.

### 2. Post-hoc capture from outside the harness

If the agent cannot or does not call Autotune directly, we capture after the fact using:

- provider export commands
- provider transcript files
- provider local session stores

### 3. Automatic live capture

Hooks/plugins/event streams are for automation, not for correctness.

They are useful when:

- the provider does not expose session context cleanly to external callers
- we want automatic capture on failure
- we want incremental tool-level events during the run

So the rule is:

- direct invocation when possible
- export/file import when direct invocation is not available
- hooks/plugins when we want zero-friction automation or richer live telemetry

## Environment Variable Injection Feasibility

Using a `session_start`-style hook to inject a session id into an environment variable is not a universal solution.

Reason:

- a child hook process generally cannot mutate the environment of the already-running parent agent process
- some runtimes let plugins influence shell subprocess environments, but that is not the same as mutating the agent process environment itself

So the practical rule is:

- if the harness can call Autotune directly, pass the session id as a CLI arg
- if a plugin can inject env into shell/tool execution, use that only for subprocesses like `autotune capture`
- otherwise, write session context to a local registry file and let Autotune resolve it later

This makes env injection an adapter-specific optimization, not a core contract.

## Recommendation

Make `autotune capture` the primary command, not `task create`.

Example intent:

```bash
autotune capture --provider codex --session <id>
autotune capture --provider claude-code
autotune capture --provider opencode --session <id>
autotune capture --provider hermes --session <id>
autotune capture --provider openclaw --session <id> --include-tools
```

The command should:

- detect the current cwd
- detect provider-specific session context if possible
- export or copy the provider transcript
- normalize it into the Autotune trace format
- optionally prompt for metadata like `outcome=failed`, `why`, `tags`, and `goal`

## Codex

### Best integration

Codex should be supported.

In the local environment, Codex provides:

- `CODEX_THREAD_ID` in shell subprocess environments
- resumable sessions via `codex resume [SESSION_ID]`
- a local session index at `~/.codex/session_index.jsonl`
- local session files under `~/.codex/sessions/`
- configurable providers in `~/.codex/config.json`

The stored session files include structured items such as:

- user/assistant messages
- reasoning items
- local shell calls
- local shell call outputs

Shell call entries also include `working_directory`, which is useful for matching a session back to the current repo path.

### Best capture path

Preferred order:

1. if `CODEX_THREAD_ID` is present, use it directly
2. otherwise, if the harness can pass the current Codex session id, call `autotune capture --provider codex --session <id>`
3. otherwise, scan `~/.codex/sessions/**/*.jsonl` for `session_meta.payload.cwd == <current cwd>`
4. if multiple files match, choose the one that also contains the current prompt or the most recently updated matching file
5. read the session id from the `session_meta.payload.id` field
6. ingest the local session JSONL directly into the Autotune trace format

### Why Codex is special

Codex is both a provider surface and a harness surface because it can run against multiple configured providers while still writing one local session format. That means Autotune should treat Codex as its own adapter, not as a bunch of separate per-model adapters.

### Verified local shape

In the current environment, the newer Codex session format is JSONL and includes a `session_meta` record like:

- `payload.id`
- `payload.timestamp`
- `payload.cwd`
- `payload.model_provider`

Also, shell/tool subprocesses in the current environment include `CODEX_THREAD_ID`, and it matched the active session id exactly in this conversation. That is a stronger resolver than `cwd` matching and avoids ambiguity when multiple Codex sessions share the same repo path.

### Env injection feasibility

I did not find a general hook/plugin surface for Codex from local CLI inspection. For Codex, session resolution should rely on:

- `CODEX_THREAD_ID` when running inside the current Codex-managed shell/tool environment
- explicit session id when available
- local session index plus local session files otherwise

## Claude Code

### Best official integration

Claude Code hooks are the cleanest integration point.

Anthropic's official hooks docs show that hook input includes:

- `session_id`
- `transcript_path`
- `cwd`

This is exactly what Autotune needs for capture.

Useful hook events:

- `SessionStart`
- `PreToolUse`
- `PostToolUse`
- `SubagentStart`
- `TaskCreated`
- `TaskCompleted`
- `PreCompact`
- `PostCompact`
- `SessionEnd`
- `Stop`
- `StopFailure`

### Best capture path

1. install an Autotune Claude hook
2. on `SessionStart`, register the session id and transcript path
3. on `SessionEnd` or `StopFailure`, copy/ingest the transcript JSONL
4. optionally ingest incremental hook events for richer metadata

### Fallback

If hooks were not installed beforehand, the official docs still expose `transcript_path` as a session artifact in hook/status contexts, so transcript-file ingestion is the right abstraction. I did not find an official Claude Code export command in the docs used here, so the safe recommendation is hooks + transcript file, not shell-screen scraping.

### Additional heuristic

The user's Claude Code idea is a valid heuristic for interactive sessions:

- run `echo $PPID` in bash to get the Claude Code PID
- read `~/.claude/sessions/{PID}.json`
- extract `sessionId`

This should be treated as a fallback heuristic, not the primary contract, because it depends on current local Claude internals and interactive-session behavior.

### Env injection feasibility

Claude hooks can run commands and provide session metadata, but they are not a reliable way to mutate the environment of the running Claude process. The correct Claude-specific use of hooks is:

- write session context to a registry file
- or auto-trigger capture directly

## OpenCode

### Best official integration

OpenCode already has an official CLI export:

```bash
opencode export [sessionID]
```

Its docs say this exports session data as JSON.

### Live integration options

OpenCode plugins can subscribe to:

- `session.created`
- `session.updated`
- `session.idle`
- `session.compacted`
- `message.updated`
- `tool.execute.before`
- `tool.execute.after`

OpenCode also has an SDK with:

- `session.list()`
- `session.get({ path })`
- `session.messages({ path })`

### Best capture path

Preferred order:

1. if a session id is known, call `opencode export <sessionID>`
2. if OpenCode is running with plugin support, install an Autotune plugin to mirror session and tool events
3. if the local server/SDK is reachable, pull `session.messages()` and session metadata directly

This means OpenCode is one of the easier providers to support cleanly.

### Env injection feasibility

OpenCode is the best fit for env-based subprocess support because its plugin docs explicitly show `shell.env`, which can inject environment variables into shell execution. That means an OpenCode plugin could set something like `AUTOTUNE_SESSION_ID` for shell-invoked subprocesses, including `autotune capture`.

This still should be treated as a provider-specific optimization, not the global design.

## Hermes Agent

### Best official integration

Hermes docs plus the local setup note say:

- plugin discovery from `~/.hermes/plugins/`
- plugin manifest is `plugin.yaml` plus `__init__.py`
- `pre_llm_call` receives `session_id`
- a plugin can set `HERMES_SESSION_ID` in `os.environ`
- sessions are automatically logged to `~/.hermes/sessions/`
- the CLI can resume sessions by id
- `hermes sessions export <id>` exports a session

### Best capture path

1. if `HERMES_SESSION_ID` is present, use it directly
2. otherwise, if the user or harness knows the session id, use it directly
3. run `hermes sessions export <id>`
4. if needed, fall back to `~/.hermes/sessions/` JSON files

### Notes

Hermes now looks stronger than previously thought because it supports a plugin-based env export path once configured. The required setup is documented in [hermes-session-id-plugin.md](/Users/soami/Desktop/code/int/autotune/docs/hermes-session-id-plugin.md).

### Env injection feasibility

Hermes env injection is feasible if we install a small plugin that registers `pre_llm_call` and sets `HERMES_SESSION_ID` in `os.environ`. This is not available by default, so it should be treated as a setup-dependent optimization.

## OpenClaw

### Best official integration

OpenClaw gives multiple official capture surfaces:

- `openclaw sessions export <session-id>`
- transcript files at `~/.openclaw/agents/<agentId>/sessions/<SessionId>.jsonl`
- `sessions_history` with `includeTools`
- HTTP history API with `follow=1`
- WebSocket transcript subscriptions
- hooks and plugin hooks

Its docs also mention:

- `tool_result_persist` can transform tool results before they are written to the session transcript
- hooks can keep an audit trail of commands and trigger follow-up automation

### Best capture path

Preferred order:

1. after-the-fact: `openclaw sessions export <session-id>`
2. richer post-hoc import: read the transcript JSONL directly
3. live capture: use `GET /sessions/{sessionKey}/history?includeTools=1&follow=1` or WebSocket subscriptions
4. richest integration: install an Autotune plugin/hook that records tool events before persistence

OpenClaw is the strongest provider of the group for live streaming capture surfaces.

### Env injection feasibility

OpenClaw definitely has hooks and plugin hooks, but the docs reviewed here support them more as event-driven automation than as a clean cross-process env injection channel for the running agent. As with Claude Code, registry-file or direct auto-capture is the safer abstraction.

## What This Means For Our CLI

### V0 command surface should be capture-first

Recommended commands:

- `autotune init`
- `autotune capture`
- `autotune import`
- `autotune append`
- `autotune annotate`
- `autotune trace list`
- `autotune trace show`
- `autotune trace link`
- `autotune merge`
- `autotune export sft`
- `autotune export preference`

### Task should be optional in V0

The user's workflow is:

1. model is already running
2. model fails
3. user invokes Autotune

That means forcing a separate `task create` before capture is too much friction.

So in V0:

- capture the trace first
- attach optional metadata like `goal`, `outcome`, `tags`, `provider`, `session_id`, `reason`
- later let curation/linking derive shared tasks or attempt groups

## Provider Support Priority

Recommended order:

1. Codex

- local session store
- multi-provider harness surface

2. Claude Code

- huge relevance for coding users
- official `transcript_path` hook input

3. OpenCode

- official JSON export
- plugin/event system

4. Hermes Agent

- official session export
- documented local session storage

5. OpenClaw

- powerful session tooling and streaming APIs
- but operationally broader than a coding-only CLI

If we want the fastest end-to-end success, Codex + Claude Code + OpenCode are the best initial trio.

## Architecture Note

The system should be extensible around provider adapters with multiple fallbacks per adapter.

Each adapter should support as many of these modes as possible:

1. `direct_session_arg`
2. `provider_export_command`
3. `local_session_store`
4. `hook_or_plugin_registry`
5. `live_event_stream`
6. `heuristic_pid_or_process_lookup`
7. `setup_installed_env_export`

That lets us add new harnesses later without changing the core Autotune storage model.

## Sources

- Claude Code hooks: https://code.claude.com/docs/en/hooks
- Codex local CLI/help and local session store were inspected in the current environment
- OpenCode CLI: https://opencode.ai/docs/cli/
- OpenCode plugins: https://opencode.ai/docs/plugins/
- OpenCode SDK: https://opencode.ai/docs/sdk/
- Hermes CLI guide: https://hermes-agent.nousresearch.com/docs/user-guide/cli/
- Hermes CLI commands: https://hermes-agent.nousresearch.com/docs/reference/cli-commands/
- Hermes homepage feature summary: https://hermes-agent.nousresearch.com/
- OpenClaw sessions CLI: https://openclaw.cc/en/cli/sessions
- OpenClaw session concepts: https://docs.openclaw.ai/concepts/session
- OpenClaw session tools: https://docs.openclaw.ai/concepts/session-tool
- OpenClaw hooks: https://docs.openclaw.ai/automation/hooks
