# Insights

- For agent training, raw traces are not the dataset. The dataset is a derived artifact built from raw traces plus rewards, preferences, or verifier outcomes.
- Failed and successful sessions for the same task should be linked as separate immutable attempts, then transformed into SFT, preference, or RL examples instead of being naively merged into one synthetic trace.
- PI Mono-style session JSONL is a strong canonical trace container because it is append-only, tree-structured, and extensible; training exports should still be materialized as separate explicit artifacts.
- Local project trace stores should live under `~/.autotune/projects/<basename>--<path-hash>/` rather than inside the repo or under a plain basename-only directory, to keep on-device discovery easy without collisions.
- V0 should be capture-first, not task-first: if users only invoke Autotune after an agent fails, the primary abstraction should be a trace plus metadata, with cross-trace grouping derived later.
- Hooks are optional automation, not a core requirement; prefer direct capture from inside the harness when possible, then provider export/session files, and only then hooks/plugins for zero-friction or richer live telemetry.
- Provider integrations should be adapter-based with layered fallbacks like direct session args, export commands, local session stores, hook/plugin registries, live event streams, and last-resort heuristics.
- Current Codex-managed shell/tool subprocesses expose `CODEX_THREAD_ID`; that should be the primary Codex session resolver, with local session-store matching only as fallback when that env var is absent.
- We should maintain a harness instruction layer alongside provider adapters: use native skill/command/subagent surfaces per harness so the agent knows when and how to invoke Autotune, rather than forcing one universal file format.
- Some harnesses require setup helpers in addition to instructions; Hermes is the first clear case, where a small plugin should expose `HERMES_SESSION_ID`, so the CLI should include a harness-aware `autotune setup` command.
- `autotune setup` needs two first-class modes: interactive for humans and non-interactive flag-driven one-liners for agents/harnesses.
- The user-facing curation workflow can be simplified to one `autotune merge` command that creates an idealized merged trace while raw traces remain immutable underneath.
- `autotune merge` should operate on stored trace ids in V0; cross-harness harness/session provenance should already be attached during capture rather than passed again at merge time.
- V0 should use one merge backend, not a merge adapter per harness; PI coding agent is a good fit because it is installable via npm and already supports providers/models, sessions, skills, extensions, and process integration.
- `autotune setup` should always ensure PI is installed, and `autotune merge` should use PI’s own configured/default model rather than exposing a separate Autotune `--model` override in V0.
- The core product should be TypeScript/Node; use harness-native languages only for thin bridge helpers like Hermes plugins.
- V0 does not need SQLite; a per-project `index.json` is enough for the initial `init/setup/capture/merge` loop and keeps the storage model simpler.
- Synthetic data generation from existing traces is a valid future multiplier, but it should be explicitly deferred until the base setup/capture/merge/export loop is stable and every synthetic artifact is clearly marked and linked back to its real source traces.
- Initial project bootstrap should come from `npm init` plus real registry installs of the latest stable packages, then be patched into the agreed CLI shape; do not hand-author dependency versions up front.
- The implemented V0 merge backend can use `pi -p --no-session @<prompt-file>` as the default integration surface, with an `AUTOTUNE_PI_COMMAND` override kept for deterministic tests and local backend experimentation.
- A flat `traces/` directory plus `index.json` works well in practice for V0: captured vs merged trace semantics belong in metadata/provenance, not in separate directories.
- The implemented V0 `setup` flow works better as a harness multiselect that installs each harness's full default bundle at user scope instead of asking users to pick low-level components.
- Claude Code should be treated as a user-level command + hook helper surface in V0, not as a `SKILL.md` harness; Codex, OpenCode, and Hermes keep user-level skill installs.

See [agentic-trace-rl-feasibility-2026-03-28.md](/Users/soami/Desktop/code/int/autotune/docs/research/agentic-trace-rl-feasibility-2026-03-28.md).
