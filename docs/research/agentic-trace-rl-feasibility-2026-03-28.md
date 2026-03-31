# Agentic Trace Collection and RL Feasibility

Date: 2026-03-28

## Question

Can this project:

1. Collect agentic traces from tools like Codex, Claude Code, Cursor, OpenCode, Hermes Agent, etc.
2. Store them locally or on a hosted service.
3. Turn those traces into training data for an open-weight coding agent.
4. Eventually sell sanitized traces as a data product.

## Short Answer

Yes, but only if the project is framed as three separate systems:

1. Trace capture and storage
2. Trace curation, labeling, and reward generation
3. Training, evaluation, and deployment

Trying to collapse all three into one "trace logger that also RL trains models" will create a messy product boundary and make it much harder to know what data is actually useful.

## What Seems Correct

### 1. Local-first plus hosted is the right product shape

Raw traces are highly sensitive. They can include source code, secrets, terminal output, tickets, prompts, proprietary file paths, and tool results. A local-first design with optional hosted sync is the right default.

### 2. Agentic RL does not require only "input -> expected output"

For coding agents, exact expected outputs are often weaker than environment-backed rewards.

More useful training signals include:

- Did tests pass?
- Did the patch compile?
- Did the agent solve the user task?
- Did the user revert the change?
- Did the user ask for a dissatisfied follow-up?
- Did the agent waste tools, time, or tokens?
- Did the patch fit the codebase conventions?

This matches how current coding-agent RL systems are described publicly. Cursor says Composer is trained in real software environments with tools, and that reward signals include practical outcomes like edit usefulness, user dissatisfaction, latency, and tool behavior rather than only exact textual targets. Prime Intellect and Tinker both center RL around environments and rewards, not just prompt/completion pairs.

### 3. Combining failed and successful attempts is useful

The user intuition here is good, but the storage model should be:

- one canonical `task`
- many `attempts`
- each attempt contains one or more `episodes`
- attempts can be linked as `failed_before_success`, `superseded_by`, or `derived_from`

From that graph, you can derive:

- SFT examples from strong successful trajectories
- preference pairs from failed vs successful attempts
- RL datasets from trajectories plus terminal rewards

Do not literally merge two sessions into a fake single trace unless you have a principled transformation rule. Keep raw attempts immutable and derive training artifacts separately.

## What Needs Tightening

### 1. "Log when the model messed up" is not enough

A bad trace by itself is usually not RL-ready.

At minimum, a useful training record needs:

- the task specification
- the environment or repo snapshot
- the tool schema available to the agent
- the complete trajectory or a meaningful slice of it
- the final outcome
- a reward, preference, or verifier result

Without that, you have observability data, not training data.

### 2. Real-time RL should not be the first milestone

Cursor's real-time RL loop is credible evidence that the approach works, but it also depends on massive scale, on-policy data, eval gating, and careful anti-reward-hacking work. That is not the right initial target for this repository.

The right first target is an offline improvement loop:

1. collect traces
2. score or label them
3. generate SFT / preference / RL datasets
4. run training on demand or nightly
5. deploy the adapter
6. evaluate against held-out tasks

If that works, then you can shorten the loop later.

### 3. The data marketplace angle is real but should be phase 3

Sanitized trace resale is probably the hardest part of the business:

- ownership and consent are tricky
- proprietary code may still be reconstructable after weak sanitization
- terminal outputs often leak internal context
- training buyers will care about provenance, duplication, and contamination

So the clean sequence is:

1. build a strong local/hosted trace product
2. use it to improve your own agent loop
3. only then evaluate whether a sanitized export product is commercially viable

## What A "Valid" Training Example Looks Like

### For SFT

Use when you have a trajectory you want the model to imitate.

Minimum fields:

- task description
- initial context snapshot
- tool definitions
- high-quality action sequence or response
- terminal success metadata

### For preference training

Use when you have multiple candidate attempts for the same task.

Minimum fields:

- shared task id
- candidate A trajectory or final output
- candidate B trajectory or final output
- preference label or scalar ranking
- reason or source of preference if available

This is the cleanest way to use "bad attempt vs successful attempt" data.

### For RL

Use when you can compute or assign reward from the environment.

Minimum fields:

- task description
- environment state or reproducible environment builder
- action trajectory
- observations/tool outputs
- terminal reward
- stop reason

For coding tasks, verifiers are often the highest-value reward source:

- tests
- lint
- build success
- benchmark change
- absence of regression
- human acceptance

## Recommended Product Boundary

### Core product

A trace platform for coding agents, with:

- adapters for each agent/runtime
- a canonical event schema
- local-first append-only storage
- optional hosted ingestion
- redaction and sanitization pipeline
- curation layer for rewards, labels, and trace linking
- export pipelines for SFT, DPO/preference, and RL datasets

### Separate training layer

A training orchestrator that consumes curated datasets and produces deployable adapters or checkpoints.

This layer should not own raw trace capture. It should consume derived datasets from the trace platform.

## Recommended V0 Architecture

### 1. Canonical schema

Define first-class entities:

- `task`
- `attempt`
- `event`
- `tool_call`
- `tool_result`
- `artifact`
- `annotation`
- `reward`
- `dataset_export`

### 2. Immutable raw trace log

Store the original event stream exactly once.

Then derive:

- normalized trace view
- redacted trace view
- training examples

### 3. Two ingestion modes

- manual logging: "trace this session", "mark this attempt as bad", "link this successful retry"
- automatic logging: adapters/hooks around supported agents and tool runtimes

### 4. Three export targets

- SFT dataset export
- preference dataset export
- RL dataset export

### 5. Model loop

Start with LoRA adapters on a small open coding model. Do not start with full-model training.

## Recommended Technical Bets

### For training workflows

Prime Intellect looks credible for a first iteration because it explicitly targets coding-agent-driven environment creation, hosted RL runs, and deployment of resulting adapters.

Tinker also looks useful because it supports:

- direct RL training loops
- preference/RLHF workflows
- checkpoint download

Fireworks looks useful if you want hosted reinforcement fine-tuning with:

- remote rollout execution in your own infrastructure
- trace correlation
- secure BYOB dataset storage
- LoRA deployment for inference

### For initial training style

Use this order:

1. SFT on successful traces
2. preference optimization on good vs bad attempts
3. environment-backed RL only after verifiers are reliable

That order is much more forgiving than jumping straight to RL.

## Biggest Risks

### 1. Reward hacking

If the reward is naive, the model will exploit it. Cursor explicitly calls this out. This is not a corner case; it is a central design constraint.

### 2. Missing environment reproducibility

If you cannot recreate the repo state, tool access, and success criteria, the trace is much less useful for RL.

### 3. Overfitting to one agent wrapper

A schema designed around one tool's event format will be painful to generalize later.

### 4. Privacy and secret leakage

Hosted raw trace storage is dangerous without strong redaction, encryption, tenancy isolation, and explicit consent.

## Suggested First Milestones

### Milestone 1

Build a local-only CLI that can:

- create a `task`
- ingest a manual trace bundle
- link attempts for the same task
- mark success/failure
- attach human notes
- export SFT and preference examples

### Milestone 2

Add one automatic adapter, ideally for a runtime you control well.

### Milestone 3

Add verifier-backed scoring for coding tasks:

- patch applies
- tests pass
- lint passes
- user accepted

### Milestone 4

Run small-model LoRA fine-tuning on curated data and evaluate on held-out tasks.

### Milestone 5

Add hosted sync and sanitation workflows.

## External References

- Cursor on Composer RL and tool-use training: https://cursor.com/blog/composer
- Cursor on real-time RL, on-policy pressure, and reward hacking: https://cursor.com/blog/real-time-rl-for-composer
- Prime Intellect guide for environment -> eval -> RL -> deploy workflow: https://docs.primeintellect.ai/guides/rl-training
- Tinker RL basics: https://tinker-docs.thinkingmachines.ai/rl/rl-basic
- Tinker RL environments: https://tinker-docs.thinkingmachines.ai/rl/rl-envs
- Tinker RLHF example: https://tinker-docs.thinkingmachines.ai/preferences/rlhf-example
- Tinker checkpoint download: https://tinker-docs.thinkingmachines.ai/download-weights
- Fireworks remote environments for RFT: https://docs.fireworks.ai/fine-tuning/connect-environments
- Fireworks secure training / BYOB: https://docs.fireworks.ai/fine-tuning/secure-fine-tuning
- Fireworks LoRA deployment: https://docs.fireworks.ai/fine-tuning/deploying-loras
- Fireworks zero data retention: https://docs.fireworks.ai/guides/security_compliance/data_handling
