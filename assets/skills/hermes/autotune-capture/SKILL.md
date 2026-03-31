---
name: autotune-capture
description: Capture the current Hermes session as an Autotune trace for curation and training data generation.
version: "1.0"
required_environment_variables:
  - HERMES_SESSION_ID
---

## When to use

Run this skill when the current task has failed or you want to preserve the
session for later curation.

## Prerequisites

The `session-env` plugin must be installed so that `HERMES_SESSION_ID` is
available. If it is missing, tell the user to run:
```bash
autotune setup --harness hermes --component session-env-plugin --yes
```

## Steps

1. Determine the session id:
   - If `HERMES_SESSION_ID` is set, use it.
   - Otherwise, ask the user or run `hermes sessions export <id>` to find it.
2. Run the capture command:
   ```bash
   autotune capture --harness hermes \
     --outcome <failed|partial|successful|unknown> \
     --goal "<what you were trying to do>" \
     --reason "<what went wrong>"
   ```
   If `HERMES_SESSION_ID` is not set, pass `--session <id>` explicitly.
3. Report the trace id to the user.
4. If the user wants to merge traces:
   ```bash
   autotune merge --trace <trace-id-1> --trace <trace-id-2>
   ```
