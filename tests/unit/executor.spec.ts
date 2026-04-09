import * as path from "node:path";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createExecutor } from "../../src/executor";
import { JobPool } from "../../src/job-pool";

const fakePiPath = path.join(__dirname, "../fixtures/fake-pi.sh");

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

		expect(result.isError).toBe(false);
		expect(result.content[0]?.text).toContain("Found 2 matches.");
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
		expect(result.isError).toBe(true);
		expect(pool.get("test-6")?.status).toBe("aborted");
	});
});
