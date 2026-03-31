Capture the current Claude Code session as an Autotune trace.

## Instructions

You are being invoked because the user wants to capture this session for
Autotune trace curation.

1. Determine the session context:
   - If a transcript path is available, use `--transcript-path`.
   - If the user provided a session id, use `--session`.
   - Otherwise, inform the user that you will attempt automatic resolution from the installed Autotune hook registry.
2. Run the capture:
   ```bash
   autotune capture --harness claude-code \
     --outcome <failed|partial|successful|unknown> \
     --goal "<what you were trying to do>" \
     --reason "<what went wrong>" $ARGUMENTS
   ```
3. Report the resulting trace id.
4. If the user wants to merge traces:
   ```bash
   autotune merge --trace <trace-id-1> --trace <trace-id-2>
   ```

`$ARGUMENTS` can include additional flags or a short failure description.
