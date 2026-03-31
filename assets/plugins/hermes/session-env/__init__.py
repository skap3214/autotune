"""Expose the Hermes session ID as an environment variable.

Uses pre_llm_call which fires on every turn (new + resumed sessions).
Always updates to handle session ID rotation after context compression.
"""

import os


def _set_session_id(session_id, **kwargs):
    os.environ["HERMES_SESSION_ID"] = session_id


def register(ctx):
    ctx.register_hook("pre_llm_call", _set_session_id)
