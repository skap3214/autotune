---
name: autotune-capture
description: Capture the current Codex session as an Autotune trace for curation and training data generation.
---

## When to use

Run this skill when the current coding task has clearly failed, produced a
wrong result, or you want to preserve the session for later curation.

## Steps

1. Run the capture command. The CLI reads `CODEX_THREAD_ID` from the
   environment automatically:
   ```bash
   autotune capture --harness codex \
     --outcome <failed|partial|successful|unknown> \
     --goal "<what you were trying to do>" \
     --reason "<what went wrong>"
   ```
   If `CODEX_THREAD_ID` is not set, ask the user for the session id and
   pass it explicitly with `--session <id>`.
2. If the capture succeeds, report the trace id to the user.
3. If the user wants to merge this trace with others, run:
   ```bash
   autotune merge --trace <trace-id-1> --trace <trace-id-2>
   ```

## Notes

- Use `--note` for any extra context that does not fit cleanly into `--goal`,
  `--outcome`, or `--reason`.
