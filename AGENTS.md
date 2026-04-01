# Autotune

Agentic trace collection, storage, and RL fine-tuning pipeline. Captures tool-use traces from coding agents (Claude Code, Codex, Hermes Agent, OpenCode, Cursor, etc.), stores them locally or on a hosted service, and uses them for reinforcement learning on open-source models or data marketplace sales.

## Documentation

| Directory | Purpose |
|-----------|---------|
| `docs/research/` | All research conducted — findings, comparisons, explorations |
| `docs/plans/` | Implementation plans created by LLMs |
| `docs/architecture/` | Architectural and design decisions that have been made and implemented |
| `docs/insights.md` | Small, general insights worth revisiting later |

## Export Formatting Rule

Training export formats (sharegpt, sft-jsonl, chatml) must never inject fabricated conversation turns. No information is added or inferred — only reformatted. Metadata (harness, goal, outcome, model) belongs as top-level fields on the JSONL object, not as fake system messages or conversation turns that were not part of the original session.

## Documentation Rules

1. **Before starting work** — read existing docs to avoid duplicating research or contradicting decisions.
2. **After completing meaningful work** — update relevant docs.
3. **If you discover something that changes a previous finding** — update the original doc and note what changed and why.
4. **Cross-reference** between docs when relevant.
