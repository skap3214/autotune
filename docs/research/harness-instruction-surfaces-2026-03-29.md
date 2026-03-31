# Harness Instruction Surfaces Research

Date: 2026-03-29

Related:

- [Provider Trace Capture Research](/Users/soami/Desktop/code/int/autotune/docs/research/provider-trace-capture-2026-03-29.md)
- [PI Mono-Based Trace Platform Plan](/Users/soami/Desktop/code/int/autotune/docs/plans/pi-mono-trace-plan-2026-03-29.md)

## Goal

Figure out how each harness should be taught to use the Autotune CLI, and what file format or customization surface to use.

## Summary

We should not force one universal "skill file" abstraction across all harnesses.

Instead, we should use the native reusable-instruction surface for each harness:

- Codex: skill
- OpenCode: skill
- Hermes: skill
- OpenClaw: skill
- Claude Code: command or subagent, plus optional `CLAUDE.md` rule

## Recommendation

Create one shared Autotune workflow spec, then wrap it in the native syntax of each harness.

Suggested repo structure:

```text
docs/
  references/
    autotune-capture-workflow.md
harness/
  codex/
    skills/autotune-capture/SKILL.md
  opencode/
    skills/autotune-capture/SKILL.md
  hermes/
    skills/autotune-capture/SKILL.md
  openclaw/
    skills/autotune-capture/SKILL.md
  claude-code/
    commands/autotune-capture.md
    agents/autotune-capture.md
```

The shared workflow doc should define:

- when to invoke Autotune
- what command to run for capture
- what command to run for merge
- how to pass stored trace ids into merge
- how to resolve the session id
- what metadata to attach
- when to fall back to manual annotation

Each harness wrapper should only add syntax and harness-specific resolution instructions.

The installation path should also be scriptable so a harness or agent can enable support without manual editing.

For V0, the merge workflow itself should target one backend: PI coding agent.

## Codex

### Native surface

Codex uses skills defined by `SKILL.md` files with YAML frontmatter plus markdown instructions.

From the local Codex skill tooling:

- required metadata is `name` and `description`
- body is markdown instructions
- optional bundled scripts/references/assets are supported

### Recommended artifact

Create a Codex skill named `autotune-capture`.

Setup mode:

- interactive: offer to install the skill into the user Codex skills directory
- non-interactive: `autotune setup --harness codex --component skill --yes`

What it should teach:

- if `CODEX_THREAD_ID` is present, use it
- otherwise ask the user for a session id or fall back to local session resolution
- run the CLI with the correct provider/session args

### Notes

Codex also already uses `AGENTS.md` for project rules, so the skill should be task-specific and reusable, not mixed into the project rules file.

## Claude Code

### Native surfaces

Claude Code does not appear to have a first-class "skill" abstraction matching AgentSkills.

The closest official instruction surfaces are:

- `CLAUDE.md` for project/global rules
- custom slash commands in `.claude/commands/*.md`
- subagents in `.claude/agents/*.md` with YAML frontmatter

### Recommended artifact

For Autotune, the best fit is a custom slash command:

- `.claude/commands/autotune-capture.md`

Why:

- the user can invoke it directly when frustrated
- the markdown body becomes the prompt
- `$ARGUMENTS` can pass optional notes or failure descriptions

Optional second artifact:

- `.claude/agents/autotune-capture.md`

This is useful if we want Claude to proactively delegate capture logic to a dedicated subagent.

Setup mode:

- interactive: offer command install and optional subagent install
- non-interactive:
  - `autotune setup --harness claude-code --component command --yes`
  - `autotune setup --harness claude-code --component subagent --yes`

### Syntax

#### Slash command

- markdown file
- no YAML required
- filename becomes command name
- `$ARGUMENTS` placeholder supported

#### Subagent

- markdown with YAML frontmatter
- required: `name`, `description`
- optional: `tools`

## OpenCode

### Native surfaces

OpenCode supports:

- `AGENTS.md` for rules
- Agent Skills via `SKILL.md`

OpenCode searches:

- `.opencode/skills/<name>/SKILL.md`
- `~/.config/opencode/skills/<name>/SKILL.md`
- and compatible `.claude/skills` / `.agents/skills` paths

### Recommended artifact

Create an OpenCode skill named `autotune-capture`.

Setup mode:

- interactive: offer installation into the detected OpenCode skills path
- non-interactive: `autotune setup --harness opencode --component skill --yes`

### Syntax

`SKILL.md` with YAML frontmatter.

Recognized frontmatter fields:

- `name`
- `description`
- optional `license`
- optional `compatibility`
- optional `metadata`

### Notes

OpenCode is compatible with `.claude/skills` and `.agents/skills`, so we may be able to share most of the same AgentSkills-compatible wrapper used for Codex/OpenCode/OpenClaw.

## Hermes

### Native surfaces

Hermes explicitly treats skills as the preferred extension mechanism.

Installed Hermes skills are also automatically registered as slash commands.
Hermes also supports plugins under `~/.hermes/plugins/`, which matters here because we can install a tiny session-id plugin that exports `HERMES_SESSION_ID`.

### Recommended artifact

Create:

- a Hermes skill named `autotune-capture`
- a Hermes plugin install step for `session-env`

Setup mode:

- interactive: offer both skill and plugin installation
- non-interactive:
  - `autotune setup --harness hermes --component skill --yes`
  - `autotune setup --harness hermes --component session-env-plugin --yes`

### Syntax

`SKILL.md` with YAML frontmatter plus markdown body.

Documented fields include:

- `name`
- `description`
- `version`
- `author`
- `license`
- optional `platforms`
- optional `metadata.hermes.*`
- optional `required_environment_variables`

### Notes

Because Hermes skill metadata is richer than plain AgentSkills, Hermes will likely need its own wrapper file even if the core instructions are shared.

Also, Hermes is the clearest example of why we need a harness setup layer in addition to instruction artifacts: the skill can tell Hermes how to call Autotune, but the plugin is what makes `HERMES_SESSION_ID` available automatically.

## OpenClaw

### Native surfaces

OpenClaw uses skills that are AgentSkills-compatible.

Skills live in:

- `<workspace>/skills/`
- `~/.openclaw/skills/`

Plugins can also ship skills.

### Recommended artifact

Create an OpenClaw skill named `autotune-capture`.

Setup mode:

- interactive: offer skill installation into the detected OpenClaw skills path
- non-interactive: `autotune setup --harness openclaw --component skill --yes`

### Syntax

`SKILL.md` with YAML frontmatter and markdown body.

Documented fields include:

- `name`
- `description`
- optional `metadata.openclaw.os`
- optional `metadata.openclaw.requires.bins`
- optional `metadata.openclaw.requires.config`

### Notes

OpenClaw appears close enough to AgentSkills that we should try to share the Codex/OpenCode/OpenClaw skill body and only vary metadata if needed.

## Standardized Skill Behavior

Regardless of harness, the reusable instructions should say:

1. when the model is clearly failing, run Autotune capture
2. when multiple related traces exist, run Autotune merge to create the idealized merged trace
3. prefer explicit session id if available
4. otherwise use the harness-specific resolver
5. if no high-confidence resolver works, ask the user for confirmation or annotate the trace as unresolved
6. attach metadata like `outcome=failed`, `reason`, `goal`, and freeform notes
7. when merging, pass stored trace ids; the cross-harness provenance should already be inside those traces

## Plan Impact

The implementation plan should include a harness-instruction layer, not just provider adapters.

That means two parallel workstreams:

1. provider capture adapters
2. harness-facing instruction artifacts
3. harness-specific setup/install steps when needed

Those setup/install steps should themselves support:

- interactive installation for humans
- non-interactive one-liners for agents

The adapters solve "how do we import traces?"

The harness artifacts solve "how does the agent know when and how to invoke Autotune?"

The merge backend should be simpler:

- one merge engine in V0: PI coding agent
- multiple capture adapters
- multiple harness instruction wrappers

## Sources

- Claude Code subagents: https://docs.anthropic.com/en/docs/claude-code/sub-agents
- Claude Code common workflows / slash commands: https://docs.anthropic.com/en/docs/claude-code/common-workflows
- Claude Code settings / `CLAUDE.md`: https://docs.anthropic.com/en/docs/claude-code/settings
- OpenCode rules: https://opencode.ai/docs/rules
- OpenCode skills: https://opencode.ai/docs/skills
- Hermes creating skills: https://hermes-agent.nousresearch.com/docs/developer-guide/creating-skills/
- Hermes CLI interface: https://hermes-agent.nousresearch.com/docs/user-guide/cli/
- OpenClaw creating skills: https://docs.openclaw.ai/tools/creating-skills
- OpenClaw skills: https://docs.openclaw.ai/skills
- Codex local skill tooling was inspected from the current environment via `skill-creator` and local skill metadata
