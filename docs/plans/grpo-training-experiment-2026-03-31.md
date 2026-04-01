# GRPO Training Experiment Plan

Date: 2026-03-31 (updated 2026-04-01)
Status: Ready to execute (v2 — uses TRL directly, no Unsloth)
Instance: GPU instance with 80GB+ VRAM (A100, H100, or GH200)

## Goal

Validate that coding agent traces + LLM-as-judge reward + GRPO training produces meaningful improvement in an open-weight model's agentic coding ability. This is a proof-of-concept, not a production training run.

## Background

- **PivotRL** (arXiv:2603.21383) showed that local RL from expert trajectories with GRPO + functional verifier reward achieves E2E RL accuracy with 4x fewer rollout turns and avoids SFT's catastrophic forgetting.
- An **LLM-as-judge** is a valid verifier (the paper explicitly supports this), eliminating the need for environment snapshots during training.
- **TRL v1** has `GRPOTrainer` as a stable, production-ready API. It runs on a single GPU with standard PyTorch — lowest infrastructure burden of any RL training library.
- Unsloth did not work in practice. TRL directly is simpler and more reliable.
- See: `docs/research/training-strategy-pivotrl-rft-2026-03-31.md` for full research context.

## Model

Start with **Qwen3-8B** (hybrid reasoning model, ~16GB in bf16 + LoRA overhead).
- If that works, try scaling to **Qwen3.5-27B** (~56GB).
- If OOM, fall back to **Qwen3-4B**.

Qwen3 models support `<think>` reasoning, which matches our reasoning traces.

## Step 1: Environment Setup

```bash
mkdir -p ~/autotune-experiment && cd ~/autotune-experiment

# Install TRL and dependencies (no Unsloth)
pip install trl transformers accelerate peft bitsandbytes datasets torch

# For LLM-as-judge reward function
pip install requests

# Verify GPU
python -c "import torch; print(torch.cuda.get_device_name(0)); print(f'{torch.cuda.get_device_properties(0).total_mem / 1e9:.1f}GB')"
```

## Step 2: Prepare Training Data

I have real Claude Code traces in sharegpt format. Upload `claude-sessions-sharegpt.jsonl` to the instance.

The data needs to be converted to the format TRL's GRPOTrainer expects. Each example should have a `prompt` field containing the conversation up to where the model should generate.

```python
"""Convert sharegpt traces to TRL GRPO format."""
import json

def convert_for_grpo(input_path, output_path):
    converted = 0
    with open(input_path) as fin, open(output_path, "w") as fout:
        for line in fin:
            trace = json.loads(line)
            convs = trace.get("conversations", [])

            # Extract system + first user message as the prompt
            messages = []
            for msg in convs:
                if msg["from"] == "system":
                    messages.append({"role": "system", "content": msg["value"]})
                elif msg["from"] == "human":
                    val = msg["value"].strip()
                    if val.startswith("<") or len(val) < 10:
                        continue
                    messages.append({"role": "user", "content": val})
                    break

            if any(m["role"] == "user" for m in messages):
                # Filter: keep prompts between 50-2000 chars
                user_content = next(m["content"] for m in messages if m["role"] == "user")
                if 50 <= len(user_content) <= 2000:
                    fout.write(json.dumps({"prompt": messages}) + "\n")
                    converted += 1

    print(f"Converted {converted} examples to {output_path}")

convert_for_grpo("data/claude-sessions-sharegpt.jsonl", "data/train.jsonl")
```

## Step 3: Define the Reward Function (LLM-as-judge)

Binary reward (0 or 1). Uses a Fireworks-hosted model as the judge since we already have an API key.

```python
import requests

FIREWORKS_API_KEY = "YOUR_KEY_HERE"  # Set this

def reward_function(completions, prompts=None, **kwargs):
    """Binary LLM-as-judge reward. Returns list of 0.0 or 1.0."""
    rewards = []
    for i, completion in enumerate(completions):
        # Extract text from completion
        if isinstance(completion, list):
            text = completion[-1].get("content", "") if completion else ""
        else:
            text = str(completion)

        # Extract prompt text
        prompt_text = ""
        if prompts and i < len(prompts):
            p = prompts[i]
            if isinstance(p, list):
                prompt_text = next((m.get("content", "") for m in p if m.get("role") == "user"), "")
            else:
                prompt_text = str(p)

        if not text or len(text.strip()) < 10:
            rewards.append(0.0)
            continue

        judge_prompt = (
            'Is this a good coding assistant response? Answer ONLY "yes" or "no".\n\n'
            f"User asked: {prompt_text[:1000]}\n\n"
            f"Assistant responded: {text[:2000]}\n\n"
            "A good response: addresses the task, provides working code or "
            "correct information, and is helpful."
        )

        try:
            resp = requests.post(
                "https://api.fireworks.ai/inference/v1/chat/completions",
                headers={"Authorization": f"Bearer {FIREWORKS_API_KEY}"},
                json={
                    "model": "accounts/fireworks/models/qwen3-8b",
                    "messages": [{"role": "user", "content": judge_prompt}],
                    "max_tokens": 5,
                    "temperature": 0.0,
                },
                timeout=30,
            )
            answer = resp.json()["choices"][0]["message"]["content"].strip().lower()
            rewards.append(1.0 if "yes" in answer else 0.0)
        except Exception:
            rewards.append(0.0)

    return rewards
```

**Fallback**: If the Fireworks API is too slow or expensive for every rollout, use this simple rule-based reward to validate the loop first:

```python
def simple_reward(completions, **kwargs):
    """Binary reward: does the completion contain code and address the task?"""
    rewards = []
    for completion in completions:
        text = str(completion[-1].get("content", "")) if isinstance(completion, list) else str(completion)
        has_code = any(m in text for m in ["```", "def ", "import ", "class "])
        good_length = 50 < len(text) < 5000
        rewards.append(1.0 if (has_code and good_length) else 0.0)
    return rewards
```

## Step 4: GRPO Training

```python
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import LoraConfig, get_peft_model
from trl import GRPOTrainer, GRPOConfig
from datasets import load_dataset

# Load model
model_name = "Qwen/Qwen3-8B"
tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModelForCausalLM.from_pretrained(
    model_name,
    torch_dtype="bfloat16",
    device_map="auto",
)

# Add LoRA
lora_config = LoraConfig(
    r=16,
    lora_alpha=16,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                     "gate_proj", "up_proj", "down_proj"],
    task_type="CAUSAL_LM",
)
model = get_peft_model(model, lora_config)
model.print_trainable_parameters()

# Load dataset
dataset = load_dataset("json", data_files="data/train.jsonl", split="train")

# GRPO config
training_args = GRPOConfig(
    output_dir="./outputs",
    per_device_train_batch_size=1,
    gradient_accumulation_steps=4,
    num_generations=4,          # G rollouts per prompt (GRPO group size)
    max_completion_length=1024,
    num_train_epochs=1,
    learning_rate=5e-6,
    logging_steps=1,
    save_steps=50,
    bf16=True,
    report_to="none",
    gradient_checkpointing=True,
)

# Train with reward function from Step 3
trainer = GRPOTrainer(
    model=model,
    args=training_args,
    train_dataset=dataset,
    processing_class=tokenizer,
    reward_funcs=simple_reward,  # Start with simple_reward, swap to reward_function later
)

trainer.train()
```

### Key GRPO parameters to tune:
- `num_generations`: Number of rollouts per prompt. 4 is a good start. If OOM, try 2.
- `per_device_train_batch_size`: Keep at 1 for 8B on single GPU, use gradient accumulation.
- `max_completion_length`: Start with 1024. Increase to 2048 if completions are truncated.
- `learning_rate`: 5e-6 is conservative. Can try up to 1e-5.
- `gradient_checkpointing`: True to save VRAM.

### If VRAM is too tight:
1. Reduce `num_generations` to 2
2. Reduce `max_completion_length` to 512
3. Fall back to Qwen3-4B
4. Try 4-bit quantization: `load_in_4bit=True` in model loading

## Step 5: Evaluate

After training, test on held-out coding prompts and compare against the base model.

```python
from peft import PeftModel

# Load base + LoRA for inference
model = AutoModelForCausalLM.from_pretrained(model_name, torch_dtype="bfloat16", device_map="auto")
model = PeftModel.from_pretrained(model, "./outputs/final-lora")

prompt = "Fix the off-by-one error in this binary search implementation:\n```python\ndef binary_search(arr, target):\n    lo, hi = 0, len(arr)\n    while lo < hi:\n        mid = (lo + hi) // 2\n        if arr[mid] == target:\n            return mid\n        elif arr[mid] < target:\n            lo = mid\n        else:\n            hi = mid\n    return -1\n```"

messages = [{"role": "user", "content": prompt}]
inputs = tokenizer.apply_chat_template(messages, return_tensors="pt", add_generation_prompt=True).to("cuda")
outputs = model.generate(inputs, max_new_tokens=1024, temperature=0.7, do_sample=True)
print(tokenizer.decode(outputs[0], skip_special_tokens=True))
```

## Step 6: Export

```python
# Save LoRA adapter
model.save_pretrained("./outputs/final-lora")
tokenizer.save_pretrained("./outputs/final-lora")

# Push to HuggingFace (optional)
# model.push_to_hub("your-username/autotune-qwen3-8b-grpo")
# tokenizer.push_to_hub("your-username/autotune-qwen3-8b-grpo")
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
1. Add more Autotune traces as training data
2. Implement PivotRL-style pivot filtering (only train on high-variance turns)
3. Upgrade reward to proper LLM-as-judge with expert trace context
4. Scale to larger model (Qwen3.5-27B) and more data
5. Evaluate on SWE-bench or similar coding benchmarks

## References

- PivotRL paper: https://arxiv.org/abs/2603.21383
- TRL v1 blog: https://huggingface.co/blog/trl-v1
- TRL GRPO trainer: https://huggingface.co/docs/trl/grpo_trainer
- Fireworks fine-tuning blog: https://fireworks.ai/blog/fine-tuning-bottlenecks
- Training strategy research: docs/research/training-strategy-pivotrl-rft-2026-03-31.md
