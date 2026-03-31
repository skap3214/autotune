---
name: autotune-capture
description: Capture the current Claude Code session as an Autotune trace for curation and training data generation.
---

## When to use

Run this skill when the current coding task has clearly failed, produced a
wrong result, or you want to preserve the session for later curation.

## Steps

1. Determine the session context:
   - If a transcript path is available, use `--transcript-path`.
   - If the user provided a session id, use `--session`.
   - Otherwise, attempt automatic resolution.
2. Run the capture command:
   ```bash
   autotune capture --harness claude-code \
     --outcome <failed|partial|successful|unknown> \
     --goal "<what you were trying to do>" \
     --reason "<what went wrong>" $ARGUMENTS
   ```
3. If the capture succeeds, report the trace id to the user.
4. If the user wants to merge this trace with others, run:
   ```bash
   autotune merge --trace <trace-id-1> --trace <trace-id-2>
   ```

## Notes

- Use `--note` for any extra context that does not fit cleanly into `--goal`,
  `--outcome`, or `--reason`.
