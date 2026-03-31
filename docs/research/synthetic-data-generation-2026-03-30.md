# Synthetic Data Generation From Existing Traces

Date: 2026-03-30

Related:

- [Autotune Master Implementation Plan](/Users/soami/Desktop/code/int/autotune/docs/plans/master-implementation-plan.md)
- [CLI Contract V0](/Users/soami/Desktop/code/int/autotune/docs/plans/cli-contract-v0-2026-03-30.md)
- [Agentic Trace RL Feasibility](/Users/soami/Desktop/code/int/autotune/docs/research/agentic-trace-rl-feasibility-2026-03-28.md)

## Question

Should Autotune eventually support synthetic data generation based on existing real traces?

## Short Answer

Yes. This looks like a valid future direction, but it should be treated as a research/deferred capability, not part of the V0 implementation plan.

## Why It Matters

Potential benefits:

- expand sparse domains where we do not yet have enough real traces
- create multiple high-quality variants of a good merged trace
- generate repaired or improved alternatives from weak traces
- increase coverage of edge cases without waiting for organic failures

There is active research suggesting synthetic trajectory/data generation can improve downstream training quality when used carefully. For Autotune specifically, this could become a force multiplier on top of real captured traces.

## Constraints

Synthetic data should not replace real traces as the core source of truth.

It should be:

- derived from real traces
- explicitly marked as synthetic
- linked back to its source traces
- separated from raw data in storage and exports

## Prerequisites

Do not prioritize this before the base loop works:

1. `autotune setup`
2. `autotune capture`
3. `autotune merge`
4. stable export pipeline

Only after that should synthetic expansion be considered.

## Likely Forms

- synthetic variants of successful merged traces
- synthetic repairs of failed traces
- partial-trace completion
- counterfactual alternative tool paths
- synthetic preference pairs derived from strong vs weak trajectories

## Storage Rule

Synthetic traces should use the same canonical trace container family as other traces, but must include explicit derivation metadata showing:

- source trace ids
- generation method
- generator model/backend
- synthetic flag

## Possible Future Command

Potential future command:

```bash
autotune synthesize --trace <trace-id> [--trace <trace-id> ...]
```

Not part of V0.
