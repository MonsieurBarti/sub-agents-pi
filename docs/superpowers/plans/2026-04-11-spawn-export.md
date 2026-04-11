# spawn() Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export a public `spawn()` function from `@the-forge-flow/sub-agents-pi` so TFF can programmatically spawn sub-agents with TUI pool integration.

**Architecture:** Module-level singleton pattern. `registerSubagentExtension()` stores the `JobPool` and executor in module scope. A new `spawn()` function reads from that same scope, delegates to `executor.execute()`, and returns a simplified `{ success, output }` result.

**Tech Stack:** TypeScript, vitest, biome

**Spec:** `docs/superpowers/specs/2026-04-11-spawn-export-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/spawn.ts` | Create | `spawn()` function + `SpawnResult` type |
| `src/index.ts` | Modify | Module-level singleton, `getSharedState()`, named exports |
| `tests/unit/spawn.spec.ts` | Create | Tests for `spawn()` |
| `tests/unit/index.spec.ts` | Modify | Tests for `getSharedState()` and new exports |

---

### Task 1: Add module-level singleton and `getSharedState()` to index.ts

**Files:**
- Modify: `src/index.ts`
- Test: `tests/unit/index.spec.ts`

- [ ] **Step 1: Write the failing tests**

Add these tests to `tests/unit/index.spec.ts`, inside the existing `describe("extension registration", ...)` block, after the existing tests:

```ts
describe("getSharedState()", () => {
	// Import the named export — must be done at top of file or inline
	let getSharedState: typeof import("../../src/index").getSharedState;

	beforeEach(async () => {
		// Re-import to get fresh module state. vitest module cache means
		// we rely on the env-var cleanup from the outer describe.
		const mod = await import("../../src/index");
		getSharedState = mod.getSharedState;
	});

	it("throws before registerSubagentExtension() is called", () => {
		// Fresh import — no registration has happened in this test
		expect(() => getSharedState()).toThrow("spawn() called before registerSubagentExtension()");
	});

	it("returns pool and executor after registration", async () => {
		const pi = makeMockPi();
		const mod = await import("../../src/index");
		mod.default(pi);
		const state = mod.getSharedState();
		expect(state.pool).toBeDefined();
		expect(state.executor).toBeDefined();
	});
});
```

> **Important caveat:** The module-level singleton persists across tests in the same module. The test for "throws before registration" must run in isolation from "returns after registration". vitest runs tests in file order within a describe, so place the throw-test first. If module caching causes issues, these tests may need `vi.resetModules()` in `beforeEach`. Adjust as needed — the key assertions are: (1) throws when unregistered, (2) returns `{ pool, executor }` after registration.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/index.spec.ts`
Expected: FAIL — `getSharedState` is not exported from `../../src/index`

- [ ] **Step 3: Implement the module-level singleton in `src/index.ts`**

Add these lines near the top of `src/index.ts`, after the existing imports and before `isRunningAsSubagent()`:

```ts
import type { createExecutor } from "./executor";
import type { JobPool } from "./job-pool";

// Module-level singleton — set by registerSubagentExtension(), read by spawn().
let sharedPool: JobPool | null = null;
let sharedExecutor: ReturnType<typeof createExecutor> | null = null;

/**
 * Returns the shared pool and executor. Throws if called before
 * registerSubagentExtension(). Used internally by spawn().
 */
export function getSharedState(): {
	pool: JobPool;
	executor: ReturnType<typeof createExecutor>;
} {
	if (!sharedPool || !sharedExecutor) {
		throw new Error(
			"sub-agents-pi: spawn() called before registerSubagentExtension(). " +
			"Register the extension first.",
		);
	}
	return { pool: sharedPool, executor: sharedExecutor };
}
```

> **Note:** `JobPool` is already imported (value import) further down in the existing code. The new import at the top should be a `type` import to avoid duplicating the value import. The existing `import { JobPool } from "./job-pool"` stays as-is. Use `import type { JobPool as JobPoolT } from "./job-pool"` for the type annotation of `sharedPool`, or simply annotate `sharedPool` as `InstanceType<typeof JobPool> | null` to avoid the extra import. Choose whichever is cleanest — the key constraint is that biome's `useImportType` rule passes.

Then, inside `registerSubagentExtension()`, after the existing `const pool = new JobPool();` and `const executor = createExecutor({ pool });` lines, add:

```ts
// Publish to module scope for spawn()
sharedPool = pool;
sharedExecutor = executor;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/index.spec.ts`
Expected: PASS — all existing tests still pass, new `getSharedState()` tests pass

- [ ] **Step 5: Run full test suite + typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: All pass, no type errors

- [ ] **Step 6: Commit**

```bash
git add src/index.ts tests/unit/index.spec.ts
git commit -m "feat: add module-level singleton and getSharedState() to index"
```

---

### Task 2: Create `spawn()` function in `src/spawn.ts`

**Files:**
- Create: `src/spawn.ts`
- Create: `tests/unit/spawn.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/spawn.spec.ts`:

```ts
import * as path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import registerExtension from "../../src/index";
import { spawn } from "../../src/spawn";

const fakePiPath = path.join(__dirname, "../fixtures/fake-pi.sh");

function makeMockPi(): ExtensionAPI {
	return {
		registerTool: vi.fn(),
		registerShortcut: vi.fn(),
		on: vi.fn(),
		events: { on: vi.fn() },
	} as unknown as ExtensionAPI;
}

describe("spawn()", () => {
	const origDepth = process.env.PI_SUBAGENT_DEPTH;

	beforeEach(() => {
		Reflect.deleteProperty(process.env, "PI_SUBAGENT_DEPTH");
	});

	afterEach(() => {
		if (origDepth === undefined) Reflect.deleteProperty(process.env, "PI_SUBAGENT_DEPTH");
		else process.env.PI_SUBAGENT_DEPTH = origDepth;
	});

	it("throws when called before registration", async () => {
		// spawn() without prior registerSubagentExtension() should throw
		await expect(
			spawn(null, { task: "t", system_prompt: "sp" }),
		).rejects.toThrow("spawn() called before registerSubagentExtension()");
	});

	it("returns { success: true, output } on successful execution", async () => {
		// Register with piCommandOverride to use fake-pi fixture.
		// We need to reach the executor, so we register normally then
		// call spawn which uses the shared executor. However the shared
		// executor won't have piCommandOverride. We need a different
		// approach — see implementation note below.
		//
		// For now, this test verifies the wiring by checking that spawn
		// delegates to executor.execute() correctly. We mock getSharedState
		// to inject a fake executor.
		const { getSharedState } = await import("../../src/index");
		const pi = makeMockPi();
		registerExtension(pi);

		// The shared executor uses the real pi binary which we can't
		// call in tests. Instead, mock the executor at the module level.
		const mockExecute = vi.fn().mockResolvedValue({
			content: [{ type: "text", text: "Found 2 matches." }],
			details: {
				status: "completed",
				messages: [
					{
						role: "assistant",
						content: [{ type: "text", text: "Found 2 matches." }],
					},
				],
				error: undefined,
			},
		});

		// Temporarily replace the shared executor
		const state = getSharedState();
		const origExecute = state.executor.execute;
		state.executor.execute = mockExecute;

		try {
			const result = await spawn(null, {
				task: "Find foo",
				system_prompt: "You are a scout.",
				label: "scout",
			});

			expect(result.success).toBe(true);
			expect(result.output).toBe("Found 2 matches.");

			// Verify executor was called with correct args
			expect(mockExecute).toHaveBeenCalledOnce();
			const [id, params, signal, onUpdate, ctx] = mockExecute.mock.calls[0];
			expect(id).toMatch(/^spawn-\d+-\d+$/);
			expect(params.task).toBe("Find foo");
			expect(params.system_prompt).toBe("You are a scout.");
			expect(params.label).toBe("scout");
			expect(signal).toBeUndefined();
			expect(onUpdate).toBeUndefined();
			expect(ctx.cwd).toBe(process.cwd());
		} finally {
			state.executor.execute = origExecute;
		}
	});

	it("returns { success: false, output } on failed execution", async () => {
		const { getSharedState } = await import("../../src/index");
		const pi = makeMockPi();
		registerExtension(pi);

		const mockExecute = vi.fn().mockResolvedValue({
			content: [{ type: "text", text: "cwd does not exist: /nonexistent" }],
			details: {
				status: "failed",
				messages: [],
				error: "cwd does not exist: /nonexistent",
			},
		});

		const state = getSharedState();
		const origExecute = state.executor.execute;
		state.executor.execute = mockExecute;

		try {
			const result = await spawn(null, {
				task: "Find foo",
				system_prompt: "sp",
				cwd: "/nonexistent",
			});

			expect(result.success).toBe(false);
			expect(result.output).toBe("cwd does not exist: /nonexistent");
		} finally {
			state.executor.execute = origExecute;
		}
	});

	it("uses params.cwd when provided", async () => {
		const { getSharedState } = await import("../../src/index");
		const pi = makeMockPi();
		registerExtension(pi);

		const mockExecute = vi.fn().mockResolvedValue({
			content: [{ type: "text", text: "" }],
			details: { status: "completed", messages: [], error: undefined },
		});

		const state = getSharedState();
		const origExecute = state.executor.execute;
		state.executor.execute = mockExecute;

		try {
			await spawn(null, {
				task: "t",
				system_prompt: "sp",
				cwd: "/custom/path",
			});

			const [, params, , , ctx] = mockExecute.mock.calls[0];
			expect(params.cwd).toBe("/custom/path");
			expect(ctx.cwd).toBe("/custom/path");
		} finally {
			state.executor.execute = origExecute;
		}
	});

	it("generates unique IDs across calls", async () => {
		const { getSharedState } = await import("../../src/index");
		const pi = makeMockPi();
		registerExtension(pi);

		const mockExecute = vi.fn().mockResolvedValue({
			content: [{ type: "text", text: "" }],
			details: { status: "completed", messages: [], error: undefined },
		});

		const state = getSharedState();
		const origExecute = state.executor.execute;
		state.executor.execute = mockExecute;

		try {
			await spawn(null, { task: "t1", system_prompt: "sp" });
			await spawn(null, { task: "t2", system_prompt: "sp" });

			const id1 = mockExecute.mock.calls[0][0];
			const id2 = mockExecute.mock.calls[1][0];
			expect(id1).not.toBe(id2);
			expect(id1).toMatch(/^spawn-/);
			expect(id2).toMatch(/^spawn-/);
		} finally {
			state.executor.execute = origExecute;
		}
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/spawn.spec.ts`
Expected: FAIL — `../../src/spawn` does not exist

- [ ] **Step 3: Write `src/spawn.ts`**

Create `src/spawn.ts`:

```ts
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { formatFinalOutput } from "./formatters.js";
import { getSharedState } from "./index.js";
import type { SubagentParamsT } from "./types.js";

export interface SpawnResult {
	success: boolean;
	output: string;
}

let spawnCounter = 0;

export async function spawn(
	_pi: unknown,
	params: SubagentParamsT,
): Promise<SpawnResult> {
	const { executor } = getSharedState();

	const id = `spawn-${Date.now()}-${++spawnCounter}`;
	const cwd = params.cwd ?? process.cwd();
	const ctx = { cwd } as ExtensionContext;

	const result = await executor.execute(id, { ...params, cwd }, undefined, undefined, ctx);

	return {
		success: result.details.status === "completed",
		output: formatFinalOutput(result.details.messages) || result.details.error || "",
	};
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/spawn.spec.ts`
Expected: PASS — all 5 tests pass

- [ ] **Step 5: Run full test suite + typecheck + lint**

Run: `npx vitest run && npx tsc --noEmit && npx biome check .`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add src/spawn.ts tests/unit/spawn.spec.ts
git commit -m "feat: add spawn() function for programmatic sub-agent execution"
```

---

### Task 3: Add named exports to `src/index.ts`

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/index.spec.ts`, at the top level (outside existing describe blocks):

```ts
describe("named exports", () => {
	it("exports spawn from the package entry point", async () => {
		const mod = await import("../../src/index");
		expect(mod.spawn).toBeTypeOf("function");
	});

	it("exports getSharedState from the package entry point", async () => {
		const mod = await import("../../src/index");
		expect(mod.getSharedState).toBeTypeOf("function");
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/index.spec.ts`
Expected: FAIL — `mod.spawn` is undefined (not yet re-exported)

- [ ] **Step 3: Add named exports to `src/index.ts`**

Add these lines at the top of `src/index.ts`, after the existing imports:

```ts
export { spawn } from "./spawn.js";
export type { SpawnResult } from "./spawn.js";
export type { SubagentParamsT } from "./types.js";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/index.spec.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite + typecheck + lint**

Run: `npx vitest run && npx tsc --noEmit && npx biome check .`
Expected: All pass, no regressions

- [ ] **Step 6: Commit**

```bash
git add src/index.ts tests/unit/index.spec.ts
git commit -m "feat: export spawn, SpawnResult, and SubagentParamsT from package entry"
```

---

### Task 4: Final verification

**Files:** None (read-only verification)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: All tests pass (existing + new)

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run lint + format check**

Run: `npx biome check .`
Expected: No issues

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: Clean build, `dist/spawn.js` and `dist/spawn.d.ts` exist

- [ ] **Step 5: Verify dist exports**

Check that the built output includes the new exports:

```bash
grep -l "spawn" dist/index.js dist/index.d.ts dist/spawn.js dist/spawn.d.ts
```

Expected: All four files found and contain spawn references

- [ ] **Step 6: Commit if any fixups were needed, otherwise done**

If any fixes were needed during verification, commit them:

```bash
git add -A
git commit -m "fix: address verification findings"
```
