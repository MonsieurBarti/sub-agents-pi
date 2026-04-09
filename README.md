<div align="center">
  <img src="https://raw.githubusercontent.com/MonsieurBarti/The-Forge-Flow-CC/refs/heads/main/assets/forge-banner.png" alt="The Forge Flow - Sub-Agents PI" width="100%">

  <h1>🧬 Sub-Agents PI</h1>

  <p>
    <strong>Spawn isolated sub-agents with live TUI spying for PI</strong>
  </p>

  <p>
    <a href="https://github.com/MonsieurBarti/sub-agents-pi/actions/workflows/ci.yml">
      <img src="https://img.shields.io/github/actions/workflow/status/MonsieurBarti/sub-agents-pi/ci.yml?label=CI&style=flat-square" alt="CI Status">
    </a>
    <a href="https://www.npmjs.com/package/@the-forge-flow/sub-agents-pi">
      <img src="https://img.shields.io/npm/v/@the-forge-flow/sub-agents-pi?style=flat-square" alt="npm version">
    </a>
    <a href="LICENSE">
      <img src="https://img.shields.io/github/license/MonsieurBarti/sub-agents-pi?style=flat-square" alt="License">
    </a>
  </p>
</div>

---

Spawn sub-agents on demand with custom identities, models, and thinking levels. Watch them work live in a dedicated TUI that keeps your main conversation clean.

## ✨ Features

- **🧬 Ad-hoc spawning** — Define sub-agent identity inline per call (no markdown files, no registry)
- **🔒 Isolated context** — Each sub-agent runs in a separate `pi` process with `--no-session`
- **👀 Live TUI spying** — Watch tool calls stream in real-time with a three-tier UI
- **📊 Three-tier UI** — Scrollback row, bottom widget counter, interactive overlay panel
- **⚡ Concurrent execution** — Run multiple sub-agents in parallel (PI runs tool calls concurrently)
- **🛑 Abort support** — Kill running sub-agents with `Escape` or `k` in the panel
- **🤖 PI-native** — Seamless integration with PI's tool system, abort-signal aware, themed output

## 📦 Installation

PI discovers the extension automatically once installed as a pi package. By default this installs globally into `~/.pi/agent/`; pass `-l` to install into the current project (`.pi/`) instead.

**From npm (recommended):**

```bash
pi install npm:@the-forge-flow/sub-agents-pi
```

**From GitHub (tracks `main`):**

```bash
pi install git:github.com/MonsieurBarti/sub-agents-pi
```

**Pin to a specific version:**

```bash
# npm — pin to a published version
pi install npm:@the-forge-flow/sub-agents-pi@0.1.0

# git — pin to a release tag
pi install git:github.com/MonsieurBarti/sub-agents-pi@sub-agents-pi-v0.1.0
```

Then reload PI with `/reload` (or restart it). On the next session you should see a notification that sub-agents is ready.

**Manage installed packages:**

```bash
pi list    # show installed packages
pi update  # update non-pinned packages
pi remove npm:@the-forge-flow/sub-agents-pi
pi config  # enable/disable individual extensions, skills, prompts, themes
```

> For project-scoped installs, package filtering, and more, see the [pi packages doc](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/packages.md).

## 🚀 Usage

### Basic invocation

Ask your LLM to delegate work:

```
Use a sub-agent with system_prompt "You are a fast codebase scout. Return file:line refs with one-line summaries." and task "Find all JWT parsing code" and model "claude-haiku-4-5" and label "jwt-scout"
```

The `subagent` tool spawns a child process that runs independently. You'll see:
- **Scrollback row** — Compact status with live tool calls, final summary after completion
- **Bottom widget** — Counter showing running/done sub-agents (`🧬 sub-agents  2 running · 1 done`)
- **Overlay panel** — Rich interactive view opened with `alt+s`

### Opening the spy panel

Press `alt+s` to open the interactive sub-agents panel:

- **↑↓** — Navigate between sub-agents
- **Enter** — Zoom into selected sub-agent's detail view
- **k** — Kill selected running sub-agent (with confirmation)
- **Escape** — Close panel (or exit zoom mode)

The panel shows a two-pane view: list of sub-agents on the left, live detail on the right. Tool calls stream in real-time, usage stats update live.

### Tool parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `task` | ✅ | The task prompt to send to the sub-agent |
| `system_prompt` | ✅ | The sub-agent's identity/instructions |
| `label` | Optional | Short display name for the TUI (default: `"subagent"`) |
| `model` | Optional | Model id (e.g., `claude-sonnet-4-5`). Defaults to parent's model. |
| `thinking` | Optional | Thinking level: `off`, `minimal`, `low`, `medium`, `high`, `xhigh` |
| `cwd` | Optional | Working directory for the child process |
| `tools` | Optional | Builtin tool allowlist (e.g., `["read", "grep", "bash"]`) for sandboxing |

### Read-only scout example

Create a sandboxed scout that can only read and search:

```
Use a sub-agent with system_prompt "You are a read-only scout. Find all authentication-related code and return file:line refs." and task "Map the auth surface area" and model "claude-haiku-4-5" and tools ["read", "grep", "find", "ls"] and label "auth-scout"
```

The sub-agent won't be able to write files, edit code, or run bash commands — perfect for safe reconnaissance.

## 🎨 TUI Overview

### Scrollback tool row

The inline view where the tool was called:

```
⏳ subagent jwt-scout · claude-haiku-4-5:low · 2.3s · 3 turns · ↑1.2k ↓340
   grep /jwt\.verify/ in src/
   read src/auth/verify.ts:30-60
 ▸ read src/middleware/authed.ts        ← current

(ctrl+o to expand)
```

Press `Ctrl+O` to expand and see the full transcript, all tool calls, and the final message rendered as Markdown.

### Bottom widget

Persistent counter below the editor:

```
🧬 sub-agents  2 running · 1 done    [alt+s] open panel
```

Auto-clears 30 seconds after all sub-agents finish.

### Overlay panel

Rich interactive view opened with `alt+s`:

```
╭─ 🧬 Sub-agents ──────────────────────────────────────────────╮
│  ⏳ jwt-scout              │ jwt-scout                        │
│     claude-haiku-4-5:low   │ Task: Find all JWT parsing sites │
│     2.3s · 3t             │                                   │
│                           │ Tool calls:                       │
│ ▸⏳ test-runner            │   grep /jwt/ in src/             │
│     claude-sonnet-4-5     │ ▸ read src/auth.ts               │
│     1.1s · 1t             │                                   │
├───────────────────────────┴───────────────────────────────────┤
│ ↑↓ select · enter zoom · k kill · esc close                   │
╰───────────────────────────────────────────────────────────────╯
```

Press **Enter** to zoom into the selected sub-agent's full detail view.

## 🔧 Development

```bash
bun install
bun test
bun run build
```

## 📄 License

MIT
