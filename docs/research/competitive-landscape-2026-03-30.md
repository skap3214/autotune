# Competitive Landscape: Agentic Trace Collection & RL Fine-Tuning

Date: 2026-03-30

Related:
- [Agentic Trace Collection and RL Feasibility](agentic-trace-rl-feasibility-2026-03-28.md)
- [Provider Trace Capture Research](provider-trace-capture-2026-03-29.md)

## Summary

Autotune sits at the intersection of three areas: (1) trace capture from coding agents, (2) trace curation into training data, and (3) RL/SFT fine-tuning on open models. **No single project covers all three the way Autotune intends.** But each piece has strong existing work, and some combinations are close.

The landscape breaks into five categories:

| Category | Key Players | Overlap with Autotune |
|----------|-------------|----------------------|
| Agent trace capture & observability | agent-trace, LangSmith, Arize, Braintrust | Layer 1 only (capture) |
| Agent RL training frameworks | Microsoft Agent Lightning, Fireworks Eval Protocol | Layer 3 only (training) |
| SWE trajectory datasets & benchmarks | SWE-Gym, SWE-smith, Nebius trajectories, R2E-Gym | Layer 2 (curated data) |
| Coding data marketplaces | Datacurve, Scale AI | Business model overlap |
| Closed-loop proprietary systems | Cursor (real-time RL) | Full loop but closed |

## Detailed Analysis

---

### 1. agent-trace (agent-strace)

**Repo:** https://github.com/Siddhant-K-code/agent-trace
**Stage:** Early open-source (18 stars, alpha on PyPI)

**What it does:**
- Captures tool calls, prompts, and responses from Claude Code (via hooks), Cursor/Windsurf (via MCP proxy), or Python decorators
- Stores as NDJSON (flat event stream, no database)
- Supports replay, explain (phase detection), cost estimation, session diffing, causal tracing (`why`), audit against policy files
- Secret redaction, OTLP export (Datadog, Honeycomb, etc.)
- Can import existing Claude Code JSONL session logs

**What it does NOT do:**
- No training data generation (no SFT/preference/RL export)
- No trace curation or linking (failed→successful attempts)
- No fine-tuning pipeline
- No marketplace/hosted component
- No Codex, OpenCode, or Hermes support

**Overlap with Autotune:** **High on Layer 1 (capture).** agent-trace is the closest open-source project to Autotune's capture layer, especially for Claude Code. It is purely an observability/debugging tool with no training data ambitions.

**Key difference:** Autotune's core value proposition starts where agent-trace ends — turning traces into training data and running the improvement loop.

---

### 2. Microsoft Agent Lightning

**Repo:** https://github.com/microsoft/agent-lightning
**Paper:** arXiv:2508.03680 (Aug 2025)
**Stage:** Active open-source (MIT), Microsoft Research Asia

**What it does:**
- Framework-agnostic RL training for AI agents (LangChain, AutoGen, OpenAI Agent SDK, CrewAI, etc.)
- Converts agent execution into state→action transitions automatically
- LightningRL: hierarchical credit assignment for multi-step agent trajectories
- Supports PPO, GRPO, APO (automatic prompt optimization), SFT
- LightningStore for centralized span/trace management during training
- Decoupled agent runner (CPU) from training (GPU)
- Integrates with vLLM, Tinker, veRL

**What it does NOT do:**
- No capture from production coding agents (Claude Code, Codex, Cursor, etc.)
- Not designed for post-hoc trace import — expects to control the agent loop
- No trace curation, linking, or marketplace
- No provider adapters
- Agent must use `agl.emit()` calls or their tracer wrapper

**Overlap with Autotune:** **High on Layer 3 (training).** Agent Lightning is the strongest open-source RL training framework for agents. It could be a downstream consumer of Autotune's curated datasets.

**Key difference:** Agent Lightning assumes it controls agent execution. Autotune captures from existing production agents that it does not control. They are complementary: Autotune → curated data → Agent Lightning → trained model.

---

### 3. Fireworks AI Eval Protocol & Remote Environments

**Docs:** https://fireworks.ai/blog/eval-protocol-rl-on-your-agents
**Stage:** Commercial (GA)

**What it does:**
- RL training with remote environment execution
- Connect your own rollout environments (coding, browsing, etc.)
- Agent produces traces → Fireworks runs RL training (PPO, GRPO)
- Supports LoRA deployment for inference
- Secure BYOB dataset storage, zero data retention option

**What it does NOT do:**
- No capture from third-party coding agents
- No trace curation or linking
- No marketplace
- You must implement your own environment/reward

**Overlap with Autotune:** **Medium on Layer 3 (training infrastructure).** Fireworks is a hosted training backend that Autotune could use for its RL training step.

---

### 4. SWE-Gym

**Repo:** https://github.com/SWE-Gym/SWE-Gym
**Paper:** ICML 2025
**Stage:** Research (652 stars)

**What it does:**
- Environment for training SWE agents using real GitHub issues
- Provides executable environments with test-based verification
- Demonstrated rejection fine-tuning (RFT) and RL training
- Supports verifier training alongside agent training

**Overlap with Autotune:** **Medium.** SWE-Gym is an environment generator and benchmark, not a trace capture tool. It produces training data from synthetic runs, not from real user sessions.

---

### 5. SWE-smith

**Repo:** https://github.com/SWE-bench/SWE-smith
**Paper:** NeurIPS 2025 D&B Spotlight
**Stage:** Research (602 stars)

**What it does:**
- Scales training data generation for SWE agents
- Generates synthetic coding tasks from real repos
- Produces trajectories via rejection sampling fine-tuning (RFT)
- Companion to SWE-bench evaluation

**Overlap with Autotune:** **Low-medium.** SWE-smith generates synthetic tasks and trajectories. Autotune captures real-world production traces. Different data sources, potentially complementary.

---

### 6. Nebius SWE-rebench-openhands-trajectories

**Dataset:** https://huggingface.co/datasets/nebius/SWE-rebench-openhands-trajectories
**Stage:** Released dataset + fine-tuned checkpoints

**What it does:**
- 67,074 agent trajectories across 1,823 Python repos
- Generated using Qwen3-Coder on OpenHands scaffolding
- Released RFT checkpoints (30B and 235B) achieving 50–62% on SWE-bench Verified
- Demonstrates the full pipeline: collect trajectories → filter successful → fine-tune → evaluate

**Overlap with Autotune:** **Medium-high on the pipeline concept.** Nebius demonstrated exactly the loop Autotune wants to enable, but they:
- Control the agent (OpenHands) rather than capturing from arbitrary agents
- Run synthetic benchmark tasks, not real user sessions
- Release a static dataset, not a live capture/curation platform

**Key insight:** This validates that trajectory → RFT → improved model works at scale. Autotune's differentiator is capturing from *real production sessions* across *multiple agents*.

---

### 7. Scale AI (Agent-RLVR, VeRO, Agentic Rubrics)

**Papers:** Agent-RLVR (arXiv:2506.11425), VeRO (Feb 2026), Agentic Rubrics (Jan 2026)
**Stage:** Research + Commercial

**What Scale does:**
- **Agent-RLVR:** RL training for SWE agents using guidance + environment rewards (test pass rates)
- **VeRO:** Eval harness for agents to optimize agents — uses agent judges for reward
- **Agentic Rubrics:** LLM-as-judge verifiers for SWE tasks
- **RL Environments:** Commercial product for RL environment provisioning

**Overlap with Autotune:** **Medium on the training/evaluation side.** Scale provides training infrastructure and evaluation. They do not capture traces from production coding agents. They are a potential partner or competitor on the data side (Scale's data labeling business).

---

### 8. Datacurve

**URL:** https://datacurve.ai/
**Funding:** $17.7M raised (YC-backed, $15M Series A led by Chemistry)
**Stage:** Commercial, revenue-generating

**What it does:**
- Provides high-quality coding data to foundation model labs
- SFT data, RL environments, and RLHF with custom model endpoints
- Gamified bounty platform (shipd.ai) for human data creation
- Benchmarking tools to identify model gaps

**What it does NOT do:**
- Not a trace capture tool
- Data is human-generated, not agent-trace-derived
- No self-serve platform for individual developers

**Overlap with Autotune:** **Business model overlap on the data marketplace vision.** Datacurve is the closest funded competitor to Autotune's Phase 3 (sanitized trace resale), but they produce data from human experts, not from captured agent sessions.

**Key difference:** Datacurve's moat is human expert quality. Autotune's potential moat is scale — capturing millions of real agent sessions is cheaper than paying humans. But Datacurve's data is higher quality and consent-clean.

---

### 9. Cursor (Real-Time RL)

**Blog:** https://cursor.com/blog/real-time-rl-for-composer
**Stage:** Production (closed-source)

**What Cursor does:**
- Full closed-loop: user interactions → traces → RL training → model updates every ~5 hours
- Uses accepts, rejects, commits as reward signals
- On-policy training with real-time data
- Extensive reward hacking mitigation
- Composer 2 + CursorBench evaluation

**Overlap with Autotune:** **Cursor is the existence proof for what Autotune wants to enable for open-source models.** Same concept: capture real coding agent traces → reward signals → RL → better models.

**Key difference:** Cursor does this for their proprietary product only. Autotune would make this loop available across any agent and any open model. Cursor is also operating at massive scale with hundreds of engineers. Autotune cannot compete on scale but can compete on openness and multi-agent coverage.

---

### 10. LLM Observability Platforms (LangSmith, Arize, Braintrust)

**Stage:** Mature commercial products

**What they do:**
- Trace LLM calls, tool use, latency, cost
- Evaluation, prompt iteration, A/B testing
- Production monitoring and debugging

**What they do NOT do:**
- No training data export (SFT, preference, RL)
- No trace curation for training purposes
- No fine-tuning integration
- Not specifically designed for coding agents

**Overlap with Autotune:** **Low-medium.** These platforms solve observability, not training data generation. Some (like Braintrust) support dataset creation from traces, but none complete the loop to actual model training.

---

### 11. Self-Improving Agent Projects

**MaximeRobeyns/self_improving_coding_agent** (295 stars): A coding agent that works on its own codebase. Proof-of-concept, not a generalizable trace platform.

**yologdev/yoyo-evolve** (1,274 stars): A coding agent that evolves itself via daily commits. Interesting concept but single-agent, no trace capture from external agents.

**Reddit thread on recursive self-improvement via Claude Code execution traces:** Community interest exists in this pattern, but no robust tool has emerged.

---

## Gap Analysis: Where Autotune Fits

| Capability | agent-trace | Agent Lightning | SWE-Gym/smith | Nebius | Cursor | Datacurve | LangSmith et al. | **Autotune** |
|---|---|---|---|---|---|---|---|---|
| Capture from production coding agents | ✅ (Claude Code, MCP) | ❌ | ❌ | ❌ | ✅ (own only) | ❌ | Partial | **✅** |
| Multi-agent support (Codex, Claude, OpenCode, Hermes) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | **✅** |
| Trace curation & linking | ❌ | ❌ | ❌ | Basic filtering | ❌ | ❌ | ❌ | **✅** |
| SFT/preference/RL export | ❌ | ✅ (from own traces) | ✅ | ✅ | ✅ (internal) | ✅ (human data) | ❌ | **✅** |
| RL training | ❌ | ✅ | ✅ | ✅ (RFT) | ✅ | ❌ | ❌ | **Planned** |
| Local-first / privacy | ✅ | ❌ | N/A | N/A | ❌ | ❌ | ❌ | **✅** |
| Data marketplace | ❌ | ❌ | ❌ | Datasets on HF | ❌ | ✅ | ❌ | **Planned** |
| Open source | ✅ | ✅ | ✅ | ✅ (data) | ❌ | ❌ | Partial | **Planned** |

## Key Findings

### 1. The capture-to-training gap is real and unclaimed

agent-trace captures traces. Agent Lightning trains models. SWE-Gym generates synthetic data. **Nobody connects real production coding agent traces to training data at scale.** This is Autotune's primary opportunity.

### 2. Nebius/OpenHands validated the trajectory → RFT loop

67K trajectories → filter successful → fine-tune → +15-25 points on SWE-bench. This is strong evidence that the loop works. Autotune's bet is that real user traces (with richer reward signals like user acceptance, retries, and reverts) will produce even better data than synthetic benchmark runs.

### 3. Microsoft Agent Lightning is the most relevant training partner

Agent Lightning is framework-agnostic, supports GRPO/PPO/SFT, and has GPU-efficient training. Autotune should plan for Agent Lightning as a downstream training backend alongside Fireworks and Prime Intellect.

### 4. Cursor is the existence proof but not a competitor

Cursor's real-time RL proves the concept at scale. They will never open this up for other agents or open-source models. Autotune's value is democratizing this loop.

### 5. agent-trace is the closest open-source overlap

agent-trace captures Claude Code and MCP sessions with good design choices (flat events, NDJSON, zero deps, redaction). It is purely observability — no training data generation. **Autotune could either compete or build on top of agent-trace's capture layer** (it's MIT-licensed).

### 6. Datacurve is the closest business model competitor

Datacurve sells coding training data to labs. They use humans; Autotune would use captured agent traces. Different data sources, same buyers. Datacurve has $17.7M in funding and relationships with model labs. Autotune's data marketplace (Phase 3) would compete here.

### 7. Nobody does multi-agent trace capture

No tool captures from Codex + Claude Code + OpenCode + Hermes + OpenClaw in a unified format. This is Autotune's strongest unique feature.

## Risks Identified from Landscape

1. **agent-trace could add training data export.** It's MIT-licensed, actively developed, and one feature away from overlapping more. Monitor closely.

2. **LangSmith/Braintrust could add fine-tuning pipelines.** They already have traces and datasets. The step to training data export is small. LangSmith has a dataset builder.

3. **Agent Lightning could add capture adapters.** They already have a Claude Code workflow example. If they build provider adapters, the gap shrinks.

4. **Cursor could open-source their trace format.** Unlikely but would change the landscape overnight.

5. **Nebius/SWE-Gym could add real-session capture.** Currently synthetic only, but the infrastructure exists.

## Recommendations

1. **Treat agent-trace as a reference implementation, not a threat.** Study its ADRs and design choices. Consider whether to support importing agent-trace NDJSON sessions directly.

2. **Plan Agent Lightning as a training backend.** The curated dataset format should be compatible with Agent Lightning's span format or easily convertible.

3. **Move fast on multi-agent capture.** This is the strongest moat and nobody else is doing it. Codex + Claude Code + OpenCode as the first three gives a unique position.

4. **Differentiate from observability platforms early.** The value story is "traces → training data → better models", not "traces → dashboards". Avoid feature-creeping into observability.

5. **Defer the data marketplace.** The landscape confirms this is the hardest part (consent, quality, provenance). Build the capture + training loop first.

## Sources

- agent-trace: https://github.com/Siddhant-K-code/agent-trace
- Microsoft Agent Lightning: https://github.com/microsoft/agent-lightning / arXiv:2508.03680
- Fireworks Eval Protocol: https://fireworks.ai/blog/eval-protocol-rl-on-your-agents
- SWE-Gym: https://github.com/SWE-Gym/SWE-Gym (ICML 2025)
- SWE-smith: https://github.com/SWE-bench/SWE-smith (NeurIPS 2025)
- Nebius trajectories: https://huggingface.co/datasets/nebius/SWE-rebench-openhands-trajectories
- Scale AI Agent-RLVR: https://labs.scale.com/papers/agent_rlvr / arXiv:2506.11425
- Scale AI VeRO: https://labs.scale.com/papers/vero
- Datacurve: https://datacurve.ai/
- Cursor real-time RL: https://cursor.com/blog/real-time-rl-for-composer
- LangSmith: https://smith.langchain.com/
- Arize Phoenix: https://arize.com/
- Braintrust: https://braintrust.dev/
- AgentTrek (trajectory synthesis): arXiv:2412.09605 (ICLR 2025 Spotlight)
- self_improving_coding_agent: https://github.com/MaximeRobeyns/self_improving_coding_agent
