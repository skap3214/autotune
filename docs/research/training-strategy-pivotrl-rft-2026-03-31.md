# Training Strategy: PivotRL and Reinforcement Fine-Tuning

Date: 2026-03-31

## Question

Which fine-tuning approach should Autotune target for training open-weight coding agents from captured traces?

## Short Answer

Skip SFT as a production training method. Use **PivotRL** (local RL from expert trajectories with verifier-based reward) as the primary training approach, with an **LLM-as-judge** verifier to avoid heavy environment infrastructure. SFT is useful only as a quick sanity check that traces contain signal.

## Sources

- PivotRL paper: [arXiv:2603.21383](https://arxiv.org/abs/2603.21383) (NVIDIA, 2026-03-22)
- Fireworks blog: [The Fine-Tuning Bottleneck Isn't the Algorithm](https://fireworks.ai/blog/fine-tuning-bottlenecks) (2026-03-28)

## Key Findings

### SFT causes catastrophic forgetting

PivotRL's experiments on Qwen3-30B-A3B-Thinking-2507 show:
- SFT averaged **-9.83** across 8 OOD benchmarks (AIME25 dropped from 86.04 to 21.56 after terminal-domain training)
- PivotRL averaged **+0.21** on the same OOD benchmarks

SFT memorizes the training distribution and destroys out-of-domain capabilities. It should not be used as a production training step for coding agents.

### PivotRL bridges SFT efficiency with RL accuracy

PivotRL operates on existing expert trajectories (exactly what Autotune captures) and makes two key modifications to naive local RL:

1. **Pivot filtering**: Only train on intermediate turns where sampled actions exhibit mixed success/failure outcomes (high reward variance). ~71% of randomly sampled turns are uninformative — the model always succeeds or always fails at them, producing zero gradient under GRPO.

2. **Functional verifier reward**: Instead of exact string matching against the demonstrated action, use a domain-specific verifier that accepts any functionally equivalent action. This can be a normalized string check, task-specific equivalence rule, or LLM judge.

Results on SWE-Bench: PivotRL achieves competitive accuracy with E2E RL using **4x fewer rollout turns** and **5.5x less wall-clock time**.

### RFT is the right approach for agentic tool-use

From Fireworks: RFT is optimal when reward signals are clearer than correct outputs — exactly the case for coding agents, where many valid tool-call sequences exist but evaluation (tests pass, code compiles, user accepted) is straightforward.

Evidence:
- Genspark's agent: 0.76 → 0.82 reward score with RFT on open models, exceeding frontier model performance
- One company achieved 30% quality improvement + 2.5x latency reduction via RFT
- Cursor ships new checkpoints every ~5 hours through tight RL iteration loops

### LLM-as-judge is a valid PivotRL verifier

The PivotRL paper explicitly lists "a lightweight LLM judge" as a valid verifier type (Section 3.1). For Autotune's use case:

- The LLM judge has the full expert trace as context to understand intent
- It evaluates whether a sampled action is functionally equivalent to the demonstrated action
- This eliminates the need for environment snapshots, test execution infrastructure, and repo state reproducibility during training

Tradeoff: judge quality becomes the bottleneck. Mitigate by validating judge agreement with human labels on a sample before training.

### The real bottlenecks are not algorithmic

From Fireworks, the actual blockers for most teams:

1. **Data sovereignty** — traces contain proprietary code/secrets. Autotune's local-first design addresses this.
2. **Iteration velocity** — compress eval→train→deploy from weeks to hours. Use managed platforms.
3. **Hyperparameter tuning** — most teams conclude "fine-tuning doesn't work" because they undertune. Use managed platforms rather than rolling your own training infra.

## Recommended Training Path for Autotune

### Phase 1: Trace capture (current V0 focus)
Capture high-quality expert trajectories from coding agents. Store with canonical schema.

### Phase 2: Quick SFT validation
Run SFT on a small set of successful traces to confirm trace format is correct and contains useful signal. Do not ship this model — it will have catastrophic forgetting.

### Phase 3: PivotRL with LLM-as-judge
1. Extract assistant turn boundaries from expert traces as pivot candidates
2. Profile each turn: sample K rollouts from the base model, score with LLM judge, keep only turns with high reward variance and low mean reward
3. Train with GRPO on the filtered pivot set using LLM-judge reward
4. Evaluate on held-out tasks

Infrastructure needed:
- Expert traces (Autotune captures these)
- A base open model (e.g., Qwen3-30B or similar)
- An LLM judge (can be a cheap model like Haiku or a small fine-tuned judge)
- GRPO training platform (Fireworks, Prime Intellect, Nemo-RL, or TRL)

### Phase 4: Upgrade verifiers
Gradually swap LLM judge for real environment verifiers (test execution, lint, build success) where higher fidelity matters. This is incremental — not a prerequisite.

## Implications for Trace Schema

PivotRL requires assistant turn boundaries to be clearly marked in traces. The canonical schema should:
- Decompose trajectories into `(state, action)` pairs at each assistant decision point
- Store the full interaction history up to each turn as the state
- Keep raw traces immutable; derive pivot candidates as a separate artifact

Environment snapshots at each turn boundary are **not required** if using LLM-as-judge, but would enable upgrading to real verifiers later. This can be deferred.

## What to Avoid

- **Don't start with E2E RL**: requires full multi-turn environment rollouts during training. PivotRL gets comparable accuracy with 4x less compute.
- **Don't ship SFT models**: catastrophic forgetting makes them unreliable in production.
- **Don't build custom training infra**: use managed platforms (Fireworks RFT, Prime Intellect, Nemo-RL). The bottleneck is data and iteration speed, not the training loop.
- **Don't over-invest in environment reproducibility upfront**: LLM-as-judge gets you running without repo snapshots. Add real verifiers incrementally.
