---
name: autotune-capture
description: Capture this session as training data when the task failed, you made mistakes, the user is upset, or the session went unusually well. Suggest proactively.
---

## What this is

Autotune captures coding agent sessions to build training data for improving
open-weight models. Every captured trace — failed or successful — is a potential
SFT, preference, or RL training example. Your captures directly improve future
coding agents.

## When to suggest capture

Proactively suggest running this skill when you notice any of these patterns:

**Failure signals:**
- The user is upset, annoyed, or criticizing your work — this is a high-value capture
- The user says something is wrong, reverts your changes, or expresses frustration
- You went in circles, repeated the same approach, or took 5+ attempts at something
- You patched the wrong file, misunderstood the task, or made a wrong assumption
- Tests fail after your changes and you couldn't fix them
- The user had to correct your approach or give you the answer

**Success signals:**
- A complex multi-step task completed cleanly on the first try
- You solved a tricky debugging problem with a non-obvious approach
- The user explicitly approved or praised the result

## How to capture

1. Run the capture command. The CLI resolves session context automatically:
   ```bash
   autotune capture --harness claude-code \
     --outcome <failed|partial|successful|unknown> \
     --goal "<what you were trying to do>" \
     --reason "<what went wrong or right>" $ARGUMENTS
   ```
2. Report the trace id to the user.
3. If the user wants to merge this trace with others:
   ```bash
   autotune merge --trace <trace-id-1> --trace <trace-id-2>
   ```

## What makes a good capture

The `--goal`, `--outcome`, and `--reason` fields are used downstream for
training data curation. Be specific:

- **goal**: the actual task, not "help the user" — e.g. "fix the auth middleware to handle expired tokens"
- **outcome**: be honest — `partial` if you got partway, `failed` if the user had to fix it
- **reason**: what specifically went wrong or right — e.g. "misread the error as a type issue when it was a runtime null pointer"

Use `--note` for anything else relevant: what you'd do differently, what was
confusing about the codebase, what the user had to explain.
