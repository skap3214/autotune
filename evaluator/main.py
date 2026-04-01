"""LLM-as-judge evaluator for Fireworks RFT.

Binary reward (0 or 1) - uses a Fireworks-hosted model to judge
whether the coding assistant response is good.
"""
import os
import requests


FIREWORKS_API_KEY = os.environ.get("FIREWORKS_API_KEY", "")


def evaluate(prompt: str, response: str, expected: str = "", **kwargs) -> dict:
    """Score a model response using an LLM judge. Returns 0 or 1."""
    if not response or len(response.strip()) < 10:
        return {"score": 0.0}

    judge_prompt = (
        'Is this a good coding assistant response? Answer ONLY "yes" or "no".\n\n'
        f"User asked: {prompt[:1000]}\n\n"
        f"Assistant responded: {response[:2000]}\n\n"
        "A good response: addresses the task, provides working code or correct information, and is helpful."
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
        return {"score": 1.0 if "yes" in answer else 0.0}
    except Exception:
        return {"score": 0.0}
