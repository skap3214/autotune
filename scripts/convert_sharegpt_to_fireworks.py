"""Convert sharegpt JSONL traces to Fireworks RFT format.

For RFT, we only need the prompts (system + user messages).
The model generates its own responses during training rollouts.
"""
import json
import sys
from pathlib import Path


def convert_trace(trace: dict) -> dict | None:
    """Extract the prompt from a sharegpt trace for RFT training."""
    convs = trace.get("conversations", [])
    messages = []

    for msg in convs:
        role = msg["from"]
        value = msg["value"].strip()

        if role == "system":
            messages.append({"role": "system", "content": value})
        elif role == "human":
            # Skip empty or system-generated messages
            if value.startswith("<local-command") or value.startswith("<command-name>"):
                continue
            if len(value) < 10:
                continue
            messages.append({"role": "user", "content": value})
            # For RFT, we only need up to the first real user message
            break

    # Must have at least a user message
    if not any(m["role"] == "user" for m in messages):
        return None

    return {"messages": messages}


def main():
    input_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(
        "/Users/soami/Downloads/claude-sessions-sharegpt.jsonl"
    )
    output_path = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(
        "/Users/soami/Desktop/code/int/autotune/data/fireworks-rft-prompts.jsonl"
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)

    converted = 0
    skipped = 0

    with open(input_path) as fin, open(output_path, "w") as fout:
        for line in fin:
            trace = json.loads(line)
            result = convert_trace(trace)
            if result:
                fout.write(json.dumps(result) + "\n")
                converted += 1
            else:
                skipped += 1

    print(f"Converted: {converted}")
    print(f"Skipped: {skipped}")
    print(f"Output: {output_path}")


if __name__ == "__main__":
    main()
