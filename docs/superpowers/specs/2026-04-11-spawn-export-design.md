# Design: `spawn()` public export for `@the-forge-flow/sub-agents-pi`

**Date:** 2026-04-11
**Status:** Approved

## Problem

TFF needs to programmatically spawn sub-agents from its dispatch layer without going through the LLM tool interface. The package currently only exposes a default export (`registerSubagentExtension`) and a PI tool definition — there is no public function API.

## Decision

Add a `spawn()` named export that wraps the existing `executor.execute()` machinery, returning a simplified `{ success, output }` result. Uses a module-level singleton so jobs appear in the TUI pool.

## Contract

```ts
import { spawn } from "@the-forge-flow/sub-agents-pi";
import type { SubagentParamsT, SpawnResult } from "@the-forge-flow/sub-agents-pi";

const result: SpawnResult = await spawn(pi, {
  system_prompt: "# Agent identity\n...",
  task: "Do the thing",
  label: "my-agent:slice-01",       // optional — TUI display name
  cwd: "/path/to/project",          // optional — defaults to process.cwd()
  model: "claude-sonnet-4-5",       // optional
  thinking: "medium",               // optional
  tools: ["read", "bash", "edit"],   // optional — builtin tool allowlist
});

result.success  // boolean — did the sub-agent exit cleanly (status === "completed")?
result.output   // string — last assistant text, or error message on failure
```

### Parameter table

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| system_prompt | string | yes | Sub-agent identity/instructions |
| task | string | yes | User prompt / task |
| label | string | no | TUI display name (default: "subagent") |
| cwd | string | no | Working directory (default: process.cwd()) |
| model | string | no | Model override |
| thinking | string | no | Thinking level: off/minimal/low/medium/high/xhigh |
| tools | string[] | no | Builtin tool allowlist |

### Return type

```ts
interface SpawnResult {
  success: boolean;
  output: string;
}
```

## Architecture

### Module-level singleton

`registerSubagentExtension()` stores the `JobPool` and executor in module scope. An internal `getSharedState()` function exposes them to `spawn()`.

```
registerSubagentExtension(pi)
  └─ creates JobPool + executor
  └─ stores in module-level sharedPool / sharedExecutor
  └─ registers tool, panel, widget, lifecycle (unchanged)

spawn(pi, params)
  └─ getSharedState() → { pool, executor }
  └─ executor.execute(id, params, signal=undefined, onUpdate=undefined, ctx)
  └─ maps result.details.status → { success, output }
```

### spawn() implementation (src/spawn.ts)

1. Calls `getSharedState()` — throws if `registerSubagentExtension()` hasn't been called yet.
2. Generates a unique ID: `spawn-<timestamp>-<counter>`.
3. Resolves cwd from `params.cwd ?? process.cwd()`.
4. Fabricates a minimal `ExtensionContext` (`{ cwd } as ExtensionContext`) — the executor only reads `ctx.cwd`, and only as a fallback when `params.cwd` is unset.
5. Calls `executor.execute(id, params, undefined, undefined, ctx)`.
6. Maps the result: `success = details.status === "completed"`, `output = formatFinalOutput(messages) || error || ""`.

### `_pi` parameter

The first argument (`pi`) is accepted for API compatibility with TFF's calling convention but is not used internally. The singleton approach means spawn() locates the pool/executor via module scope, not via the PI API. Reserved for potential future use (e.g., multi-instance support).

### Export surface (src/index.ts)

```ts
// Named exports — new
export { spawn } from "./spawn.js";
export type { SpawnResult } from "./spawn.js";
export type { SubagentParamsT } from "./types.js";

// Default export — unchanged
export default function registerSubagentExtension(pi: ExtensionAPI): void { ... }
```

## Error handling

All failure modes are handled by the existing executor. `spawn()` simply maps the terminal status:

| Scenario | Executor behavior | spawn() result |
|----------|-------------------|----------------|
| Called before registration | `getSharedState()` throws | Error propagates (caller should catch) |
| Called inside sub-agent (depth >= 1) | Returns structured failure | `{ success: false, output: "Nested sub-agent spawning is disabled..." }` |
| Invalid cwd | Returns structured failure | `{ success: false, output: "cwd does not exist: ..." }` |
| Child process crash | Captures stderr, status=failed | `{ success: false, output: <stderr or error> }` |
| Child process abort | status=aborted | `{ success: false, output: <last message or error> }` |
| Normal completion | status=completed | `{ success: true, output: <last assistant text> }` |

## TUI integration

Jobs spawned via `spawn()` are registered in the shared pool automatically (executor does this). This means:

- Panel (ctrl+shift+s) shows spawn()-created jobs
- Bottom widget counts them
- `session_shutdown` aborts running ones
- Prune timer cleans up finished jobs after 30s

## Files changed

| File | Change |
|------|--------|
| `src/spawn.ts` | **New** — `spawn()` function + `SpawnResult` type |
| `src/index.ts` | Add module-level singleton state, `getSharedState()`, named exports |
| `src/types.ts` | No changes (SubagentParamsT already exported) |

## Not in scope

- Abort signal support for spawn() callers (can be added later as optional parameter)
- Streaming / onUpdate callback exposure
- Multi-instance support (multiple pools)
