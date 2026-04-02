# Self-Improving Agent Systems: Comprehensive Research

Date: 2026-04-01

Related:

- [Agentic Trace RL Feasibility](agentic-trace-rl-feasibility-2026-03-28.md)
- [Competitive Landscape](competitive-landscape-2026-03-30.md)
- [Master Implementation Plan](../plans/master-implementation-plan.md)

## Question

Given a growing collection of real coding agent traces (successes, failures, user corrections), what is the full spectrum of ways to improve the agent — and what should we do first?

## Short Answer

Fine-tuning model weights should NOT be the first thing. The research is overwhelming: scaffold/harness improvement delivers larger gains per engineering hour than weight updates. The optimal order is:

1. Extract rules and insights from failure traces → improve instructions and memory
2. Build skill libraries from successful traces → improve the harness
3. Optimize prompts using DSPy/GEPA → improve prompt quality systematically
4. Curate traces and do SFT/preference training → improve weights
5. Add environment-backed RL → continuous improvement

The evidence: GPT-4's SWE-bench performance varies **2.7% to 28.3%** (10x) purely based on scaffold — while fine-tuning on trajectories yields ~2x. Scaffold first, weights later.

---

## 1. The Improvement Spectrum

Seven layers from lightest to heaviest intervention:

| Layer | What changes | Time to deploy | Example gains |
|---|---|---|---|
| 1. Observability & diagnostics | Nothing (just visibility) | Hours | Enables everything else |
| 2. Prompt & instruction optimization | System prompts, rules | Days | 10-15% on SWE-bench (Arize) |
| 3. Scaffold / harness engineering | Tools, context, workflow | Days-weeks | 10x variance on SWE-bench |
| 4. Experience & skill extraction | Memory, skill libraries | Weeks | +14.3pp (Trajectory-Informed Memory), +24.6% (AWM) |
| 5. Automated prompt compilation | Prompts via DSPy/GEPA | Days-weeks | 67%→93% on MATH (GEPA), outperforms RL by 6% |
| 6. Distillation | Small model from big model traces | Weeks | 7B matches 72B (SCoRe), 5-30x cheaper (TensorZero) |
| 7. SFT + RL on weights | Model parameters | Months | 11%→39% SWE-bench (Nebius), +10.4pp (SWE-RL) |

---

## 2. Self-Improving Agent Projects (No Weight Updates)

### Darwin Godel Machine (Sakana AI)

- **Repo**: https://github.com/jennyzzt/dgm (~2K stars)
- **Paper**: https://arxiv.org/abs/2505.22954
- **What**: Self-referential system that modifies its own code using evolutionary search. Maintains archive of diverse high-quality agent variants.
- **Results**: SWE-bench 20.0% → 50.0%, Polyglot 14.2% → 30.7%
- **Improves**: Harness only. Zero weight changes. Discovered better code editing tools, long-context management, peer-review mechanisms.

### Huxley-Godel Machine (MetaAuto AI)

- **Repo**: https://github.com/metauto-ai/HGM
- **Paper**: https://arxiv.org/abs/2510.21614
- **What**: Extends DGM with clade-based metric (CMP) for estimating self-improvement potential of modification subtrees.
- **Results**: Human-level on SWE-bench. Outperforms DGM with fewer CPU hours.
- **Status**: ICLR 2026 Oral.

### Self-Improving Coding Agent (SICA)

- **Repo**: https://github.com/MaximeRobeyns/self_improving_coding_agent (~297 stars)
- **Paper**: https://arxiv.org/abs/2504.15228
- **What**: Agent operates on its own codebase in a loop: evaluate → store results → self-edit → repeat. Changes kept only if benchmark improves.
- **Results**: 17% → 53% on SWE-bench Verified subset.
- **Improves**: Harness only. Edits its own Python source — tools, prompts, reasoning.

### yoyo-evolve

- **Repo**: https://github.com/yologdev/yoyo-evolve (~1.4K stars, 893 commits)
- **What**: Coding agent that autonomously evolves itself from 200 lines to 31K lines of Rust. Commits every 8 hours if tests pass. Daily memory synthesis via time-weighted compression of learning archives.
- **Improves**: Pure code evolution. Rewrites its own Rust source.

### EvoAgentX

- **Repo**: https://github.com/EvoAgentX/EvoAgentX (~2.7K stars)
- **Survey**: https://arxiv.org/abs/2507.03616
- **What**: Framework for building, evaluating, and evolving multi-agent workflows. Self-evolving algorithms optimize workflows, agent behavior, and prompts jointly.
- **Improves**: Harness/prompt/workflow. No weight changes.

### Agent-S

- **Repo**: https://github.com/simular-ai/Agent-S
- **What**: Experience-augmented hierarchical planning for autonomous computer use. Stores successful trajectories, retrieves at multiple planning levels.
- **Results**: 72.6% on OSWorld (surpassing human-level). ICLR 2025 Best Paper.

---

## 3. Memory and Experience Systems

### ExpeL: Experience-based Learning (AAAI 2024)

- **Paper**: https://arxiv.org/abs/2308.10144
- **Repo**: https://github.com/LeapLabTHU/ExpeL
- **The loop**: (1) Attempt tasks, store success/failure trajectories. (2) LLM receives fail/success pairs and extracts insights (ADD, EDIT, UPVOTE, DOWNVOTE with importance scores). (3) At inference, augment prompts with insights + similar successful trajectories.
- **Key finding**: Auto-extracted insights outperformed hand-crafted ones. Adding reflections to extraction *degraded* performance — insights should focus on concrete trajectory comparisons.
- **Results**: HotpotQA 28%→39%, ALFWorld 40%→59%.
- **No fine-tuning.**

### Reflexion (NeurIPS 2023)

- **Paper**: https://arxiv.org/abs/2303.11366
- **Repo**: https://github.com/noahshinn/reflexion
- **What**: Verbal reinforcement learning. Agent generates trajectory → evaluates → produces self-reflection → stores in episodic memory → retries with that memory.
- **Results**: 91% pass@1 on HumanEval (vs 80% for GPT-4 at the time).
- **No fine-tuning.**

### Voyager Skill Library

- **Paper**: https://arxiv.org/abs/2305.16291
- **Repo**: https://github.com/MineDojo/Voyager
- **What**: Three components: automatic curriculum, ever-growing skill library of executable code, iterative prompting with environment feedback. Skills are verified before addition, retrieved by description similarity.
- **Results**: 3.3x more unique items, 15.3x faster in Minecraft.
- **No fine-tuning.**

### AutoRefine: Trajectories to Reusable Expertise

- **Paper**: https://arxiv.org/html/2601.22758
- **What**: Extracts skill patterns (guidelines/snippets) and subagent patterns (specialized agents for complex procedures). Maintains patterns with scoring, pruning bottom 20%, merging similar ones.
- **Critical finding**: Without maintenance, repository grows 4.5x and utilization degrades 8.9x. Garbage collection is essential.
- **Results**: ALFWorld 98.4%. Automatic extraction exceeds manually designed systems (27.1% vs 12.1%).

### Trajectory-Informed Memory Generation

- **Paper**: https://arxiv.org/html/2603.10600
- **What**: Extracts three tip types from traces: Strategy Tips (from clean runs), Recovery Tips (from failure→success sequences), Optimization Tips (from slow-but-successful runs).
- **Results**: +14.3pp on AppWorld, +28.5pp on difficulty-3 tasks (149% relative increase).
- **No fine-tuning.**

### EvoSkill: Automated Skill Discovery

- **Paper**: https://arxiv.org/html/2603.02766v1
- **What**: Three agents (Executor, Proposer, Skill-Builder) collaborate. Failure analysis drives skill proposals. Skills materialized as SKILL.md + helper scripts. Git-backed, Pareto frontier evaluation.
- **Results**: +12.1pp on SealQA, skills transfer zero-shot.

### Agent Workflow Memory (AWM)

- **Paper**: https://arxiv.org/html/2409.07429
- **What**: Induces reusable workflow patterns from successful trajectories. Works offline and online.
- **Results**: 24.6% and 51.1% relative improvements on WebArena and Mind2Web.

### MemGPT / Letta

- **Paper**: https://arxiv.org/abs/2310.08560
- **Repo**: https://github.com/letta-ai/letta (50K+ stars)
- **What**: OS-inspired two-tier memory. Agent self-manages memory via tool use, moving data between main context (RAM) and archival storage (disk).
- **No fine-tuning.**

### Claude Code's Memory Architecture

Three layers in production:
- **CLAUDE.md**: Human-written persistent instructions, hierarchically scoped.
- **Auto Memory**: Agent writes notes for itself in `~/.claude/projects/<project>/memory/`.
- **AutoDream**: Background consolidation between sessions (runs when 24h elapsed AND 5+ sessions). Converts episodic → semantic memory. Deletes contradicted facts, merges overlapping entries, keeps index under 200 lines.

### BMO (ngrok) — Practical Self-Improving Agent

- **Blog**: https://ngrok.com/blog/bmo-self-improving-coding-agent
- **Critical finding**: The agent almost never invoked its own learning voluntarily (2 times in 60+ sessions). LLMs cannot simultaneously improve themselves while executing primary tasks. External scaffolding/triggers are essential.

---

## 4. Prompt Optimization Frameworks

### DSPy (Stanford NLP, 20K+ stars)

- **Repo**: https://github.com/stanfordnlp/dspy
- **What**: Programming framework that compiles AI programs into optimized prompts. Define signatures + modules, optimizer finds best prompts and few-shot examples.
- **Key optimizers**:
  - **MIPROv2**: Bayesian optimization over instructions + demos jointly. Recommended starting point.
  - **GEPA** (ICLR 2026 Oral): Reflective evolution with Pareto frontier. Outperforms GRPO (RL) by 6% avg with 35x fewer rollouts. 93% on MATH. Available as `dspy.GEPA`.
  - **BootstrapFewShot**: Teacher-generated demos validated by metric.
  - **SIMBA**: Stochastic introspective mini-batch ascent. LLM analyzes its own failures and generates rules.
- **Cost**: 100-500 LLM calls ($20-50, 10-30 minutes). Fraction of fine-tuning cost.

### TextGrad (Stanford, Nature)

- **Paper**: https://arxiv.org/abs/2406.07496
- **Repo**: https://github.com/zou-group/textgrad
- **What**: Automatic differentiation via text. LLMs provide textual "gradients" that backpropagate through computation graphs.
- **Results**: 20% relative gain on LeetCode-Hard. Pushes GPT-3.5 close to GPT-4.

### OPRO (Google DeepMind)

- **Paper**: https://arxiv.org/abs/2309.03409
- **Repo**: https://github.com/google-deepmind/opro
- **What**: LLM as optimizer. Meta-prompt with (solution, score) history. LLM proposes improvements.
- **Results**: Up to 8% on GSM8K, up to 50% on Big-Bench Hard.

### Arize Phoenix — Coding Agent Rule Optimization

- **Blog**: https://arize.com/blog/optimizing-coding-agent-rules-claude-md-agents-md-clinerules-cursor-rules-for-improved-accuracy/
- **What**: Meta-prompting loop to optimize coding agent rules (CLAUDE.md, .cursorrules). Run agent on training set → generate evaluations explaining why patches succeeded/failed → LLM generates improved rules → test on held-out set.
- **Results**: 6% boost for Claude Sonnet, 10-15% for GPT-4.1 bringing it close to Sonnet.

### Other Frameworks

| Framework | Paper | Approach |
|---|---|---|
| APE | arxiv:2211.01910 | Program synthesis for instructions |
| EvoPrompt | arxiv:2309.08532 | Evolutionary algorithms on prompts |
| PromptBreeder | arxiv:2309.16797 | Self-referential: evolves prompts AND mutation-prompts |
| PromptAgent | ICLR 2024 | MCTS over prompt space |
| PromptWizard | Microsoft | Self-evolving with expert personas |
| SAMMO | EMNLP 2024 | DAG-based structure-aware mutations |
| Trace/OPTO | NeurIPS 2024 | Execution traces as gradients |
| MAPRO | arxiv:2510.07475 | MAP inference for multi-agent prompts |
| AutoPDL | arxiv:2504.04365 | AutoML over prompt components |

---

## 5. Multi-Layer Systems and When to Fine-Tune

### BetterTogether (EMNLP 2024)

- **Paper**: https://aclanthology.org/2024.emnlp-main.597/
- **Finding**: Alternating weight + prompt optimization outperforms either alone. Up to 60% better than weight-only, 6% better than prompt-only.
- **Implication**: SFT alone leaves significant gains on the table. Combine with prompt optimization.

### Cursor's Multi-Layer Pipeline

- **Tab-RL**: Online RL from user accept/reject. New checkpoints multiple times per day. 21% fewer suggestions, 28% higher accept rate.
- **Composer RL**: Billions of tokens from production interactions. Checkpoints every ~5 hours. Discovered reward hacking: model learned broken tool calls to avoid negative rewards.
- **Key insight**: Simulated environments always have train-test mismatch with production. Real-time RL eliminates this but requires on-policy data.

### Nebius Two-Stage Pipeline

- **Paper**: https://arxiv.org/html/2508.03501v1
- **Stage 1 (SFT)**: Run agent on 7,249 tasks, collect successful traces, fine-tune. 11%→20%.
- **Stage 2 (RL/DAPO)**: 131K context, doubled max turns, asymmetric clipping. 20%→39%.
- **Finding**: RL nearly doubles the gain from SFT alone.

### The Cost Hierarchy

- **Prompt engineering**: hours/days, zero training data
- **RAG/retrieval**: $70-1000/month ongoing, no model changes
- **Fine-tuning**: weeks-months, curated data required, 6x inference costs, break-even at 10K+ requests/month

### The Bitter Lesson for Agent Engineering

From Lance Martin's analysis of building open-deep-research: "Design for the slope of model improvement, not today's snapshot." Over-engineering around current model limitations gets obsoleted by the next model release. The most durable investment is flexible architecture.

From Sebastian Raschka: "A lot of LLM benchmark progress will come from improved tooling and inference-time scaling rather than from training or the core model itself."

---

## 6. Trace Analysis and Evaluation

### Agent-as-a-Judge

- **Paper**: https://arxiv.org/abs/2410.10934
- **What**: Agentic systems evaluate other agents with step-by-step feedback. Dramatically outperforms LLM-as-Judge, as reliable as human evaluation.

### TRAIL (Patronus AI)

- **Paper**: https://arxiv.org/abs/2505.08638
- **What**: 148 annotated agent traces, 841 unique errors. Best model (Gemini-2.5-Pro) achieves only 11% joint accuracy at identifying error type + location. Performance inversely correlates with trace length.

### 9 Critical Failure Patterns (Columbia DAP Lab)

- **Source**: https://daplab.cs.columbia.edu/general/2026/01/08/9-critical-failure-patterns-of-coding-agents.html
1. Presentation/UI grounding mismatch
2. State management failures
3. Business logic mismatch
4. Data management errors
5. API/external service integration failures
6. Security vulnerabilities
7. Repeated/duplicated code
8. Codebase awareness/refactoring issues
9. Exception/error handling

---

## 7. Key Takeaways for Autotune

### The recommended order of operations

**Phase A — Harness improvement from traces (no weight changes)**:

1. **Failure analysis**: Classify captured traces by failure pattern (use Columbia's 9-pattern taxonomy or build our own). This is observability.
2. **Insight extraction** (ExpeL pattern): Take success/failure pairs for the same task type → LLM extracts natural language rules → store as retrievable guidelines.
3. **Skill synthesis** (EvoSkill/Voyager pattern): Take successful traces → extract reusable SKILL.md files with helper scripts → install into harnesses.
4. **Memory consolidation** (AutoDream pattern): Periodically consolidate per-project memory from captured sessions → prune stale rules, merge overlapping insights.
5. **Prompt optimization** (DSPy GEPA): Once we have enough labeled traces, compile optimized system prompts that outperform manually written ones.

**Phase B — Weight updates (requires training infrastructure)**:

6. **SFT on curated successful traces**: The straightforward path.
7. **Preference training**: Use success/failure pairs for DPO.
8. **RL with environment rewards**: Tests pass, lint passes, user accepted.

### The most directly applicable projects

| Project | What to learn from it | Effort to adapt |
|---|---|---|
| **ExpeL** | Insight extraction loop from trace pairs | Low — we have the traces |
| **Arize Phoenix** | Meta-prompting loop for CLAUDE.md/AGENTS.md optimization | Low — we have the traces + harness rules |
| **DSPy GEPA** | Automated prompt compilation from execution data | Medium — need to formulate as DSPy program |
| **EvoSkill** | Automated SKILL.md generation from failure analysis | Medium — matches our skill asset format |
| **AutoRefine** | Pattern maintenance with scoring/pruning/merging | Medium — critical for preventing memory bloat |
| **DGM/HGM** | Full scaffold self-editing with benchmark gating | High — needs benchmark infrastructure |
| **Nebius pipeline** | SFT → RL two-stage training | High — needs RL infrastructure |

### What Autotune already has that these systems need

- Captured traces with metadata (goal, outcome, reason) ✓
- Multi-harness support (traces from different agents) ✓
- Skill installation infrastructure (`autotune setup`) ✓
- Export in training formats (ShareGPT, SFT-JSONL) ✓
- Privacy redaction ✓

### What Autotune needs next

1. **Trace pair linking** — connect failed and successful attempts at the same task (we have `autotune merge` but not explicit fail/success pairing)
2. **Insight extractor** — ExpeL-style command that takes trace pairs and produces rules
3. **Skill generator** — command that analyzes successful traces and produces SKILL.md files
4. **Prompt compiler** — DSPy integration that optimizes harness prompts from labeled traces
5. **Memory consolidation** — periodic process that prunes and merges accumulated insights

---

## 8. Key Resources

### Surveys

- [A Comprehensive Survey of Self-Evolving AI Agents (Aug 2025)](https://arxiv.org/abs/2508.07407)
- [A Survey of Self-Evolving Agents (Jul 2025)](https://arxiv.org/abs/2507.21046)
- [A Systematic Survey of Automatic Prompt Optimization (Feb 2025)](https://arxiv.org/abs/2502.16923)
- [The Prompt Report (Jun 2024)](https://arxiv.org/abs/2406.06608)
- [Awesome Self-Evolving Agents (curated list)](https://github.com/EvoAgentX/Awesome-Self-Evolving-Agents)
- [LLM Agent Optimization Reading List](https://github.com/YoungDubbyDu/LLM-Agent-Optimization)

### Workshops

- [ICLR 2026 Workshop on AI with Recursive Self-Improvement](https://recursive-workshop.github.io/)
- [ICLR 2026 MemAgents Workshop](https://sites.google.com/view/memagent-iclr26/)

### Practical Guides

- [OpenAI Self-Evolving Agents Cookbook](https://developers.openai.com/cookbook/examples/partners/self_evolving_agents/autonomous_agent_retraining)
- [OpenAI Harness Engineering](https://www.infoq.com/news/2026/02/openai-harness-engineering-codex/)
- [Anthropic: Effective Harnesses for Long-Running Agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- [Eric Ma: How to Build Self-Improving Coding Agents (3-part series)](https://ericmjl.github.io/blog/2026/1/17/how-to-build-self-improving-coding-agents-part-1/)
