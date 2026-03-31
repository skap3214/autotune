# Autotune

Local-first CLI for capturing coding-agent traces and merging them into
idealized trajectories for later training/export workflows.

## Current V0

Implemented commands:

- `autotune init`
- `autotune setup`
- `autotune capture`
- `autotune merge`

Supported V0 harnesses:

- Codex
- Claude Code
- OpenCode
- Hermes

Merge backend:

- PI coding agent

## Install

```bash
npm install
npm run build
```

For local development:

```bash
npm run dev -- init
```

## Verify

```bash
npm run typecheck
npm test
npm run build
```

## Notes

- `autotune setup` always ensures PI is available.
- `autotune capture` stores traces under `~/.autotune/projects/<slug>/traces/`.
- `autotune merge` operates on stored trace ids, not raw harness session ids.
