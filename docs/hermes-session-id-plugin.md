# Hermes Session ID Plugin Setup

Expose the current Hermes session ID as `HERMES_SESSION_ID` environment variable,
accessible from all terminal/tool calls within a session.

## Why

Hermes does not expose the session ID to child processes by default. This plugin
sets `HERMES_SESSION_ID` in `os.environ` on every turn via the `pre_llm_call`
lifecycle hook. Any subprocess spawned by the terminal tool inherits it automatically.

- Works for new sessions and resumed sessions (`--resume`)
- Handles session ID rotation after context compression
- Concurrency-safe: each Hermes process has its own env, so parallel sessions
  get the correct ID

## Requirements

- Hermes Agent with plugin support (`~/.hermes/plugins/` directory)
- Plugin system uses `plugin.yaml` manifest + `__init__.py` with `register(ctx)`

## Manual Setup

### 1. Create the plugin directory

```bash
mkdir -p ~/.hermes/plugins/session-env
```

### 2. Create `plugin.yaml`

```bash
cat > ~/.hermes/plugins/session-env/plugin.yaml << 'EOF'
name: session-env
version: "1.0"
description: Expose the current session ID as HERMES_SESSION_ID environment variable
EOF
```

### 3. Create `__init__.py`

```bash
cat > ~/.hermes/plugins/session-env/__init__.py << 'PYEOF'
"""Expose the Hermes session ID as an environment variable.

Uses pre_llm_call which fires on every turn (new + resumed sessions).
Always updates to handle session ID rotation after context compression.
"""

import os


def _set_session_id(session_id, **kwargs):
    os.environ["HERMES_SESSION_ID"] = session_id


def register(ctx):
    ctx.register_hook("pre_llm_call", _set_session_id)
PYEOF
```

### 4. Restart Hermes

The plugin loads at startup. Start a new session or resume an existing one:

```bash
hermes           # new session
hermes --resume  # resumed session
```

### 5. Verify

From within a Hermes session, run:

```bash
echo $HERMES_SESSION_ID
```

Expected output: a session ID like `20260329_160430_58122c`

## Programmatic Setup (One-Liner)

For CLI automation / setup commands:

```bash
mkdir -p ~/.hermes/plugins/session-env && \
cat > ~/.hermes/plugins/session-env/plugin.yaml << 'EOF'
name: session-env
version: "1.0"
description: Expose the current session ID as HERMES_SESSION_ID environment variable
EOF
cat > ~/.hermes/plugins/session-env/__init__.py << 'PYEOF'
"""Expose the Hermes session ID as an environment variable.

Uses pre_llm_call which fires on every turn (new + resumed sessions).
Always updates to handle session ID rotation after context compression.
"""

import os


def _set_session_id(session_id, **kwargs):
    os.environ["HERMES_SESSION_ID"] = session_id


def register(ctx):
    ctx.register_hook("pre_llm_call", _set_session_id)
PYEOF
```

## Programmatic Setup (Python)

For use inside a CLI setup command:

```python
import os
from pathlib import Path

def install_hermes_session_id_plugin():
    """Install the session-env plugin into ~/.hermes/plugins/."""
    plugin_dir = Path.home() / ".hermes" / "plugins" / "session-env"
    plugin_dir.mkdir(parents=True, exist_ok=True)

    (plugin_dir / "plugin.yaml").write_text(
        'name: session-env\n'
        'version: "1.0"\n'
        'description: Expose the current session ID as HERMES_SESSION_ID environment variable\n'
    )

    (plugin_dir / "__init__.py").write_text(
        '"""Expose the Hermes session ID as an environment variable."""\n'
        '\n'
        'import os\n'
        '\n'
        '\n'
        'def _set_session_id(session_id, **kwargs):\n'
        '    os.environ["HERMES_SESSION_ID"] = session_id\n'
        '\n'
        '\n'
        'def register(ctx):\n'
        '    ctx.register_hook("pre_llm_call", _set_session_id)\n'
    )

    return plugin_dir
```

## How It Works

1. Hermes discovers plugins in `~/.hermes/plugins/` at startup
2. Each plugin's `register(ctx)` is called during discovery
3. `ctx.register_hook("pre_llm_call", callback)` registers a function that
   fires before every LLM API call
4. The callback receives `session_id` as a keyword argument and sets it in
   `os.environ`
5. The terminal tool builds child process environments from `os.environ`,
   so `HERMES_SESSION_ID` is inherited

## Session ID Format

```
{YYYYMMDD}_{HHMMSS}_{uuid4_hex[:6]}
```

Example: `20260329_160430_58122c`

- Generated at session start in `run_agent.py`
- Rotates on context compression (old session gets `ended_at`, new one gets
  `parent_session_id` pointing back)
- Stored in `~/.hermes/state.db` → `sessions` table

## Available Hooks

For reference, Hermes supports these lifecycle hooks:

| Hook              | Fires                              | Receives `session_id` | New + Resumed |
|-------------------|------------------------------------|-----------------------|---------------|
| `on_session_start`| Once on brand-new session creation | Yes                   | No (new only) |
| `pre_llm_call`    | Every turn, before API call        | Yes                   | Yes           |
| `post_llm_call`   | Every turn, after tool loop        | Yes                   | Yes           |
| `on_session_end`  | End of `run_conversation`          | Yes                   | Yes           |
| `pre_tool_call`   | Before each tool execution         | —                     | Yes           |
| `post_tool_call`  | After each tool execution          | —                     | Yes           |

We use `pre_llm_call` because it fires on every turn for all session types and
receives the session ID directly.

## Caveats

- **Requires restart**: The plugin loads at process startup. Changes take effect
  on the next `hermes` invocation.
- **Not available in system prompt**: If you need the session ID in the prompt
  itself, use `hermes --pass-session-id` instead (or in addition).
- **DB alternative**: Without the plugin, you can query the session ID from
  within a session via:
  ```bash
  sqlite3 ~/.hermes/state.db "SELECT id FROM sessions WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1;"
  ```
  This is NOT concurrency-safe with parallel sessions.
