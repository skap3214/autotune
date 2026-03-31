---
name: autotune-capture
description: Capture the current OpenCode session as an Autotune trace for curation and training data generation.
---

## When to use

Run this skill when the current task has failed or you want to preserve the
session for later curation.

## Steps

1. Determine the session id:
   - If `OPENCODE_SESSION_ID` is set, the CLI will read it automatically.
   - If you know the current OpenCode session id, use it directly.
   - Otherwise, run `opencode export` to list available sessions.
2. Run the capture command:
   ```bash
   autotune capture --harness opencode \
     --outcome <failed|partial|successful|unknown> \
     --goal "<what you were trying to do>" \
     --reason "<what went wrong>"
   ```
   If `OPENCODE_SESSION_ID` is not set, pass `--session "<session-id>"` explicitly.
3. If the capture succeeds, report the trace id to the user.
4. If the user wants to merge traces:
   ```bash
   autotune merge --trace <trace-id-1> --trace <trace-id-2>
   ```

## Notes

- OpenCode's `opencode export <sessionID>` can be used to get session data
  if direct id resolution fails.
- Use `--note` for any extra context that does not fit cleanly into `--goal`,
  `--outcome`, or `--reason`.
