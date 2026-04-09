import * as path from "node:path";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createExecutor } from "../../src/executor";
import { JobPool } from "../../src/job-pool";

const fakePiPath = path.join(__dirname, "../fixtures/fake-pi.sh");
const fakePiInterleavedPath = path.join(__dirname, "../fixtures/fake-pi-interleaved.sh");

describe("executor", () => {
	let pool: JobPool;
	let executor: ReturnType<typeof createExecutor>;

	beforeEach(() => {
		pool = new JobPool();
		executor = createExecutor({
			pool,
			piCommandOverride: { command: "/bin/bash", baseArgs: [fakePiPath] },
		});
	});

	it("runs end-to-end against fake pi binary", async () => {
		const updates: unknown[] = [];
		const result = await executor.execute(
			"test-1",
			{
				task: "Find foo occurrences",
				system_prompt: "You are a scout.",
				label: "scout",
			},
			undefined,
			(update) => updates.push(update),
			{ cwd: "/tmp", hasUI: false } as ExtensionContext,
		);

		expect(result.details?.status).toBe("completed");
		expect(result.content[0]?.type === "text" && result.content[0].text).toContain(
			"Found 2 matches.",
		);
		expect(pool.list()).toHaveLength(1);
		expect(pool.list()[0]?.status).toBe("completed");
		expect(updates.length).toBeGreaterThan(0);
	});

	it("adds job to pool on start", async () => {
		const executePromise = executor.execute(
			"test-2",
			{ task: "t", system_prompt: "sp" },
			undefined,
			undefined,
			{ cwd: "/tmp", hasUI: false } as ExtensionContext,
		);

		// Pool should have the job immediately after execute starts
		await new Promise((r) => setTimeout(r, 10));
		expect(pool.get("test-2")).toBeDefined();
		expect(pool.get("test-2")?.status).toBe("running");

		await executePromise;
	});

	it("updates job status on completion", async () => {
		await executor.execute("test-3", { task: "t", system_prompt: "sp" }, undefined, undefined, {
			cwd: "/tmp",
			hasUI: false,
		} as ExtensionContext);

		const job = pool.get("test-3");
		expect(job?.status).toBe("completed");
		expect(job?.endedAt).toBeDefined();
	});

	it("captures tool calls in result", async () => {
		const result = await executor.execute(
			"test-4",
			{ task: "t", system_prompt: "sp" },
			undefined,
			undefined,
			{ cwd: "/tmp", hasUI: false } as ExtensionContext,
		);

		expect(result.details?.toolCalls).toHaveLength(1);
		expect(result.details?.toolCalls[0]?.name).toBe("grep");
	});

	it("captures tool result payload and isError from tool_execution_end", async () => {
		const result = await executor.execute(
			"test-4b",
			{ task: "t", system_prompt: "sp" },
			undefined,
			undefined,
			{ cwd: "/tmp", hasUI: false } as ExtensionContext,
		);

		const call = result.details?.toolCalls[0];
		expect(call?.toolCallId).toBe("call_1");
		expect(call?.result).toEqual({ matches: ["src/a.ts", "src/b.ts"] });
		expect(call?.isError).toBe(false);
	});

	it("matches interleaved tool_execution_end events by toolCallId", async () => {
		const interleavedExec = createExecutor({
			pool,
			piCommandOverride: { command: "/bin/bash", baseArgs: [fakePiInterleavedPath] },
		});
		const result = await interleavedExec.execute(
			"test-interleaved",
			{ task: "t", system_prompt: "sp" },
			undefined,
			undefined,
			{ cwd: "/tmp", hasUI: false } as ExtensionContext,
		);

		// Fixture: A.start, B.start, B.end, A.end
		// Both must be captured with their correct results matched by toolCallId.
		expect(result.details?.toolCalls).toHaveLength(2);

		const byId = new Map(result.details?.toolCalls.map((c) => [c.toolCallId, c]));
		const callA = byId.get("call_A");
		const callB = byId.get("call_B");

		expect(callA?.name).toBe("grep");
		expect(callA?.args).toEqual({ pattern: "foo" });
		expect(callA?.result).toEqual({ matches: ["a", "b", "c"] });
		expect(callA?.isError).toBe(false);

		expect(callB?.name).toBe("read");
		expect(callB?.args).toEqual({ file_path: "x.ts" });
		expect(callB?.result).toEqual({ content: "<file B>" });
		expect(callB?.isError).toBe(false);
	});

	it("captures usage stats", async () => {
		const result = await executor.execute(
			"test-5",
			{ task: "t", system_prompt: "sp" },
			undefined,
			undefined,
			{ cwd: "/tmp", hasUI: false } as ExtensionContext,
		);

		expect(result.details?.usage.input).toBe(100);
		expect(result.details?.usage.output).toBe(20);
	});

	it("handles abort signal", async () => {
		const controller = new AbortController();

		const executePromise = executor.execute(
			"test-6",
			{ task: "t", system_prompt: "sp" },
			controller.signal,
			undefined,
			{ cwd: "/tmp", hasUI: false } as ExtensionContext,
		);

		// Abort after a short delay
		await new Promise((r) => setTimeout(r, 10));
		controller.abort();

		const result = await executePromise;
		expect(result.details?.status).toBe("aborted");
		expect(pool.get("test-6")?.status).toBe("aborted");
	});

	it("returns structured failure when cwd does not exist", async () => {
		const result = await executor.execute(
			"test-cwd",
			{
				task: "t",
				system_prompt: "sp",
				cwd: "/nonexistent/nope/nada",
			},
			undefined,
			undefined,
			{ cwd: "/tmp", hasUI: false } as ExtensionContext,
		);

		expect(result.details?.status).toBe("failed");
		expect(result.details?.error).toMatch(/cwd/i);
		expect(result.details?.error).toContain("/nonexistent/nope/nada");
		expect(pool.get("test-cwd")?.status).toBe("failed");
	});

	it("returns structured failure when spawn errors (does not throw)", async () => {
		const badExecutor = createExecutor({
			pool,
			piCommandOverride: { command: "/absolutely/nonexistent/binary", baseArgs: [] },
		});

		const result = await badExecutor.execute(
			"test-spawn-err",
			{ task: "t", system_prompt: "sp" },
			undefined,
			undefined,
			{ cwd: "/tmp", hasUI: false } as ExtensionContext,
		);

		expect(result.details?.status).toBe("failed");
		expect(result.details?.error).toBeDefined();
		expect(pool.get("test-spawn-err")?.status).toBe("failed");
	});

	it("emits a final onUpdate flush after the child exits", async () => {
		const updates: Array<{ status: string | undefined; turns: number }> = [];
		await executor.execute(
			"test-flush",
			{ task: "t", system_prompt: "sp" },
			undefined,
			(upd) => {
				updates.push({
					status: upd.details?.status,
					turns: upd.details?.usage.turns ?? 0,
				});
			},
			{ cwd: "/tmp", hasUI: false } as ExtensionContext,
		);

		// The last onUpdate must observe the terminal status, not a stale
		// "running" snapshot (trailing-edge flush).
		expect(updates.length).toBeGreaterThan(0);
		const last = updates[updates.length - 1];
		expect(last?.status).toBe("completed");
		expect(last?.turns).toBe(1);
	});

	it("runs two sub-agents concurrently against a shared pool without crosstalk", async () => {
		const [r1, r2] = await Promise.all([
			executor.execute(
				"concurrent-A",
				{ task: "task A", system_prompt: "sp", label: "a" },
				undefined,
				undefined,
				{ cwd: "/tmp", hasUI: false } as ExtensionContext,
			),
			executor.execute(
				"concurrent-B",
				{ task: "task B", system_prompt: "sp", label: "b" },
				undefined,
				undefined,
				{ cwd: "/tmp", hasUI: false } as ExtensionContext,
			),
		]);

		expect(r1.details?.status).toBe("completed");
		expect(r2.details?.status).toBe("completed");

		// Pool holds both jobs, neither overwrote the other.
		expect(pool.list()).toHaveLength(2);
		expect(pool.get("concurrent-A")?.status).toBe("completed");
		expect(pool.get("concurrent-B")?.status).toBe("completed");

		// Tool-call arrays are per-details, not shared.
		expect(r1.details?.toolCalls).toHaveLength(1);
		expect(r2.details?.toolCalls).toHaveLength(1);

		// Each tracked its own task text.
		expect(r1.details?.task).toBe("task A");
		expect(r2.details?.task).toBe("task B");

		// Each tracked its own usage independently.
		expect(r1.details?.usage.turns).toBe(1);
		expect(r2.details?.usage.turns).toBe(1);
	});

	it("rejects spawn when PI_SUBAGENT_DEPTH has reached the cap", async () => {
		const prev = process.env.PI_SUBAGENT_DEPTH;
		process.env.PI_SUBAGENT_DEPTH = "3"; // cap = 3, we're at 3
		try {
			const result = await executor.execute(
				"test-depth",
				{ task: "t", system_prompt: "sp" },
				undefined,
				undefined,
				{ cwd: "/tmp", hasUI: false } as ExtensionContext,
			);
			expect(result.details?.status).toBe("failed");
			expect(result.details?.error).toMatch(/depth/i);
			expect(pool.get("test-depth")?.status).toBe("failed");
		} finally {
			if (prev === undefined) Reflect.deleteProperty(process.env, "PI_SUBAGENT_DEPTH");
			else process.env.PI_SUBAGENT_DEPTH = prev;
		}
	});

	it("allows spawn when PI_SUBAGENT_DEPTH is below the cap", async () => {
		const prev = process.env.PI_SUBAGENT_DEPTH;
		process.env.PI_SUBAGENT_DEPTH = "1";
		try {
			const result = await executor.execute(
				"test-depth-ok",
				{ task: "t", system_prompt: "sp" },
				undefined,
				undefined,
				{ cwd: "/tmp", hasUI: false } as ExtensionContext,
			);
			expect(result.details?.status).toBe("completed");
		} finally {
			if (prev === undefined) Reflect.deleteProperty(process.env, "PI_SUBAGENT_DEPTH");
			else process.env.PI_SUBAGENT_DEPTH = prev;
		}
	});

	it("removes abort listener from caller signal after execute resolves", async () => {
		const controller = new AbortController();
		const parentSignal = controller.signal;
		const addSpy = vi.spyOn(parentSignal, "addEventListener");
		const removeSpy = vi.spyOn(parentSignal, "removeEventListener");

		await executor.execute(
			"test-leak",
			{ task: "t", system_prompt: "sp" },
			parentSignal,
			undefined,
			{ cwd: "/tmp", hasUI: false } as ExtensionContext,
		);

		// For every abort listener we add to the parent signal, we must remove it.
		const abortAdds = addSpy.mock.calls.filter((c) => c[0] === "abort").length;
		const abortRemoves = removeSpy.mock.calls.filter((c) => c[0] === "abort").length;
		expect(abortAdds).toBeGreaterThan(0);
		expect(abortRemoves).toBe(abortAdds);
	});
});
