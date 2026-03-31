# GRPO Training Experiment Plan

Date: 2026-03-31
Status: Ready to execute
Instance: Lambda Cloud gpu_1x_a100_sxm4 (80GB A100 SXM4)

## Goal

Validate that coding agent traces + LLM-as-judge reward + GRPO training produces meaningful improvement in an open-weight model's agentic coding ability. This is a proof-of-concept, not a production training run.

## Background

- **PivotRL** (arXiv:2603.21383) showed that local RL from expert trajectories with GRPO + functional verifier reward achieves E2E RL accuracy with 4x fewer rollout turns and avoids SFT's catastrophic forgetting.
- An **LLM-as-judge** is a valid verifier (the paper explicitly supports this), eliminating the need for environment snapshots during training.
- **Unsloth** supports GRPO directly via TRL integration, with optimized kernels for fast training and 50% less VRAM.
- See: `docs/research/training-strategy-pivotrl-rft-2026-03-31.md` for full research context.

## Model

**Qwen3.5-27B** with LoRA (bf16)
- VRAM: ~56GB (fits on 80GB A100 with headroom for GRPO rollouts)
- Unsloth model name: `Qwen/Qwen3.5-27B`
- LoRA rank: 16 (start here, can increase later)

If VRAM is too tight with GRPO rollouts, fall back to **Qwen3.5-9B** (22GB).

## Step 1: Environment Setup

```bash
# Create a working directory
mkdir -p ~/autotune-experiment && cd ~/autotune-experiment

# Install Unsloth (requires Python 3.10+)
pip install --upgrade --force-reinstall --no-cache-dir unsloth unsloth_zoo

# Install TRL for GRPO trainer
pip install trl

# Verify GPU
python -c "import torch; print(torch.cuda.get_device_name(0)); print(f'{torch.cuda.get_device_properties(0).total_mem / 1e9:.1f}GB')"
```

## Step 2: Prepare Training Data

Training data should be JSONL with conversation format. Each line is one training prompt (the model generates completions during GRPO rollouts).

```jsonl
{"messages": [{"role": "system", "content": "You are a coding assistant..."}, {"role": "user", "content": "Fix the failing test in src/utils.py..."}]}
{"messages": [{"role": "system", "content": "You are a coding assistant..."}, {"role": "user", "content": "Refactor the auth middleware to use JWT..."}]}
```

For the initial experiment, you need prompts that represent coding agent tasks. Options:
1. **Use captured Autotune traces** — extract the initial user prompt from each trace
2. **Use a public dataset** — SWE-bench prompts, or coding task datasets from HuggingFace
3. **Hand-craft 20-50 prompts** — simple coding tasks you can judge easily

Start with **50-100 prompts minimum**. Quality > quantity for a proof-of-concept.

Save as `data/train.jsonl`.

## Step 3: Define the Reward Function (LLM-as-judge)

The reward function scores each model completion from 0.0 to 1.0. For this experiment, use an LLM-as-judge that evaluates whether the model's response would correctly solve the coding task.

```python
import openai  # or anthropic, or any LLM API

def reward_function(prompts: list[str], completions: list[str], **kwargs) -> list[float]:
    """Score each completion using an LLM judge."""
    rewards = []
    for prompt, completion in zip(prompts, completions):
        judge_prompt = f"""You are evaluating a coding assistant's response.

Task given to the assistant:
{prompt}

Assistant's response:
{completion}

Score the response from 0.0 to 1.0:
- 1.0: Correct solution, well-structured, would solve the task
- 0.7: Mostly correct, minor issues
- 0.3: Partially correct, significant issues
- 0.0: Wrong, irrelevant, or harmful

Respond with ONLY a number between 0.0 and 1.0."""

        response = client.chat.completions.create(
            model="gpt-4o-mini",  # or claude-haiku, or any cheap fast model
            messages=[{"role": "user", "content": judge_prompt}],
            max_tokens=10,
        )
        try:
            score = float(response.choices[0].message.content.strip())
            rewards.append(max(0.0, min(1.0, score)))
        except ValueError:
            rewards.append(0.0)
    return rewards
```

**Important**: The judge model should be cheap and fast since it's called for every rollout. Use GPT-4o-mini, Claude Haiku, or a small local model. Do NOT use a frontier model here — it will be too slow and expensive.

**Alternative for first test**: Use a simple rule-based reward to validate the loop works before adding LLM-as-judge complexity:

```python
def simple_reward(prompts, completions, **kwargs):
    """Basic reward: does the completion contain code?"""
    rewards = []
    for completion in completions:
        has_code = "```" in completion or "def " in completion or "function " in completion
        is_reasonable_length = 50 < len(completion) < 5000
        rewards.append(1.0 if (has_code and is_reasonable_length) else 0.0)
    return rewards
```

## Step 4: GRPO Training

```python
from unsloth import FastLanguageModel
from trl import GRPOTrainer, GRPOConfig

# Load model
model, tokenizer = FastLanguageModel.from_pretrained(
    model_name="Qwen/Qwen3.5-27B",
    max_seq_length=4096,
    load_in_16bit=True,
    full_finetuning=False,
    fast_inference=False,  # Required for GRPO with Unsloth
)

# Add LoRA adapters
model = FastLanguageModel.get_peft_model(
    model,
    r=16,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                     "gate_proj", "up_proj", "down_proj"],
    lora_alpha=16,
    use_gradient_checkpointing="unsloth",
)

# Load dataset
from datasets import load_dataset
dataset = load_dataset("json", data_files="data/train.jsonl", split="train")

# GRPO config
training_args = GRPOConfig(
    output_dir="./outputs",
    per_device_train_batch_size=1,
    gradient_accumulation_steps=4,
    num_generations=4,          # G rollouts per prompt (GRPO group size)
    max_completion_length=2048,
    num_train_epochs=3,
    learning_rate=5e-6,
    logging_steps=1,
    save_steps=50,
    bf16=True,
    report_to="none",
)

# Train
trainer = GRPOTrainer(
    model=model,
    args=training_args,
    train_dataset=dataset,
    processing_class=tokenizer,
    reward_funcs=reward_function,  # from Step 3
)

trainer.train()
```

### Key GRPO parameters to tune:
- `num_generations`: Number of rollouts per prompt (4 is a good start, PivotRL uses this for group-normalized advantage)
- `per_device_train_batch_size`: Keep at 1 for 27B on single A100, use gradient accumulation instead
- `max_completion_length`: 2048 for coding tasks (increase if completions are being truncated)
- `learning_rate`: 5e-6 is conservative, can try up to 1e-5

### If VRAM is too tight:
1. Reduce `num_generations` to 2
2. Reduce `max_completion_length` to 1024
3. Fall back to Qwen3.5-9B

## Step 5: Evaluate

After training, test the model on held-out coding prompts and compare against the base model.

```python
# Quick inference test
FastLanguageModel.for_inference(model)

prompt = "Fix the off-by-one error in this binary search implementation:\n```python\ndef binary_search(arr, target):\n    lo, hi = 0, len(arr)\n    while lo < hi:\n        mid = (lo + hi) // 2\n        if arr[mid] == target:\n            return mid\n        elif arr[mid] < target:\n            lo = mid\n        else:\n            hi = mid\n    return -1\n```"

messages = [{"role": "user", "content": prompt}]
inputs = tokenizer.apply_chat_template(messages, return_tensors="pt", add_generation_prompt=True).to("cuda")
outputs = model.generate(inputs, max_new_tokens=1024, temperature=0.7)
print(tokenizer.decode(outputs[0], skip_special_tokens=True))
```

## Step 6: Export

```python
# Save LoRA adapter
model.save_pretrained("./outputs/final-lora")
tokenizer.save_pretrained("./outputs/final-lora")

# Export to GGUF for local testing with Ollama
model.save_pretrained_gguf("./outputs/gguf", tokenizer, quantization_method="q4_k_m")

# Or push to HuggingFace
# model.push_to_hub("your-username/autotune-qwen3.5-27b-grpo")
```

## Success Criteria

This experiment succeeds if:
1. The training loop runs without OOM or crashes
2. The reward signal shows variance (not all 0s or all 1s) — if uniform, the reward function needs work
3. Training loss decreases over steps
4. Qualitative comparison: the fine-tuned model produces noticeably better coding responses than the base model on 5-10 test prompts

This does NOT need to produce a production-quality model. It validates the pipeline.

## Next Steps After This Experiment

If the pipeline works:
1. Add real Autotune traces as training data (once capture is built)
2. Implement PivotRL-style pivot filtering (only train on high-variance turns)
3. Upgrade from simple reward to proper LLM-as-judge with expert trace context
4. Scale to more data and longer training runs
5. Evaluate on SWE-bench or similar coding benchmarks

## References

- PivotRL paper: https://arxiv.org/abs/2603.21383
- Unsloth Qwen3.5 docs: https://unsloth.ai/docs/models/qwen3.5/fine-tune
- TRL GRPO trainer: https://huggingface.co/docs/trl/grpo_trainer
- Fireworks fine-tuning blog: https://fireworks.ai/blog/fine-tuning-bottlenecks
- Training strategy research: docs/research/training-strategy-pivotrl-rft-2026-03-31.md
