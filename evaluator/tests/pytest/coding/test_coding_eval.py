import os
import re
import logging
import requests
from eval_protocol.models import EvaluateResult, EvaluationRow
from eval_protocol.pytest import SingleTurnRolloutProcessor, evaluation_test

logger = logging.getLogger(__name__)

FIREWORKS_API_KEY = os.environ.get("FIREWORKS_API_KEY", "")
JSONL_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../../development/coding_prompts.jsonl")
)


def llm_judge(prompt: str, response: str) -> int:
    """Call an LLM to judge if the response is good. Returns 1 or 0."""
    judge_prompt = (
        'Is this a good coding assistant response? Answer ONLY "yes" or "no".\n\n'
        f"User asked: {prompt[:1000]}\n\n"
        f"Assistant responded: {response[:2000]}\n\n"
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
        return 1 if "yes" in answer else 0
    except Exception as e:
        logger.warning(f"LLM judge failed: {e}")
        return 0


@evaluation_test(
    input_dataset=[JSONL_PATH],
    completion_params=[{
        "temperature": 0.7,
        "model": "fireworks_ai/accounts/fireworks/models/qwen3-8b",
    }],
    max_dataset_rows=5,
    passed_threshold=0.0,
    rollout_processor=SingleTurnRolloutProcessor(),
    mode="pointwise",
)
def test_coding_dataset(row: EvaluationRow, **kwargs) -> EvaluationRow:
    """Evaluate coding assistant responses using an LLM judge.

    Binary reward: 1 if the LLM judge says the response is good, 0 otherwise.
    """
    logger.info(f"Evaluating rollout: {row.execution_metadata.rollout_id}")

    # Get the user prompt and model response
    user_prompt = ""
    model_response = ""
    for msg in row.messages:
        if msg.role == "user":
            user_prompt = str(msg.content)
        elif msg.role == "assistant":
            model_response = str(msg.content)

    if not model_response or len(model_response.strip()) < 10:
        score = 0
        reason = "Empty or trivial response"
    else:
        score = llm_judge(user_prompt, model_response)
        reason = "LLM judge: good response" if score == 1 else "LLM judge: poor response"

    row.evaluation_result = EvaluateResult(
        score=score,
        is_score_valid=True,
        reason=reason,
    )
    logger.info(f"Done evaluating rollout: {row.execution_metadata.rollout_id}, score={score}")
    return row
