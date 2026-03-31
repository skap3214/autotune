# Language Decision: TypeScript-First Core

Date: 2026-03-30

Related:

- [Autotune CLI Contract V0](/Users/soami/Desktop/code/int/autotune/docs/plans/cli-contract-v0-2026-03-30.md)
- [PI Mono-Based Trace Platform Plan](/Users/soami/Desktop/code/int/autotune/docs/plans/pi-mono-trace-plan-2026-03-29.md)

## Decision

Autotune should use TypeScript/Node for the core product in V0.

This includes:

- the main CLI
- local storage and indexing logic
- provider capture adapters
- harness setup/install logic
- PI merge orchestration
- wrapper generation for skills/commands/subagents

## Why

### 1. PI coding agent is already in the Node/npm ecosystem

We are using PI as the only merge backend in V0, and it is already distributed and configured in the Node world.

### 2. This product is CLI-heavy and JSON-heavy

Autotune is mainly:

- command execution
- JSON and JSONL parsing
- file-system operations
- subprocess orchestration
- plugin/skill/command file generation

That is a very strong fit for TypeScript/Node.

### 3. Global installation story is straightforward

Shipping a CLI that users and harnesses can install with npm is simpler than introducing Python environment management for the whole core product.

### 4. It avoids an unnecessary polyglot core

Some harnesses require native helper files in other languages, but that does not justify making the core CLI polyglot.

## Exceptions

Harness-native helper code should use the language the harness expects.

Examples:

- Hermes plugin helper: Python
- provider-specific shell snippets: shell
- future training subsystem: possibly Python if it genuinely benefits from Python ML tooling

These should remain thin integration layers, not the main application language.

## Non-Goals

This decision does not mean:

- all future training code must be TypeScript
- we can never add Python subsystems later
- every harness plugin must be implemented in TypeScript

It only means the Autotune core should be TypeScript-first unless a subsystem has a strong reason not to be.

## Practical Rule

Use:

- TypeScript for core Autotune packages and commands
- harness-native languages only for minimal bridge components

## Consequence

The implementation should be structured so that:

- the CLI and storage logic live in one TypeScript codebase
- bridge plugins are isolated in small installable templates/assets
- later Python training code, if added, can be a separate subsystem instead of contaminating the core CLI architecture
