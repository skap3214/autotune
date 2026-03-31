#!/usr/bin/env python3
"""Persist Claude Code session metadata for Autotune capture resolution."""

import json
import os
import pathlib
import sys


def main():
    payload = json.load(sys.stdin)
    autotune_home = pathlib.Path(os.path.expanduser("~/.autotune"))
    runtime_dir = autotune_home / "runtime"
    runtime_dir.mkdir(parents=True, exist_ok=True)

    out = {
        "session_id": payload.get("session_id"),
        "transcript_path": payload.get("transcript_path"),
        "cwd": payload.get("cwd"),
        "hook_event": payload.get("hook_event_name"),
    }

    (runtime_dir / "claude-code-session.json").write_text(
        json.dumps(out, indent=2) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
