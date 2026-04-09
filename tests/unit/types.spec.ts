import { describe, expect, it } from "vitest";
import {
	type SubagentDetails,
	type SubagentJob,
	THINKING_LEVELS,
	type UsageStats,
} from "../../src/types";

describe("types", () => {
	it("THINKING_LEVELS contains all expected values", () => {
		expect(THINKING_LEVELS).toEqual(["off", "minimal", "low", "medium", "high", "xhigh"]);
	});

	it("SubagentDetails has expected shape", () => {
		const details: SubagentDetails = {
			id: "test-1",
			label: "scout",
			model: "claude-haiku-4-5:low",
			status: "running",
			startedAt: Date.now(),
			task: "find stuff",
			systemPrompt: "you are a scout",
			toolCalls: [],
			currentTools: new Map(),
			usage: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				cost: 0,
				turns: 0,
				contextTokens: 0,
			},
			messages: [],
			cwd: "/tmp",
		};
		expect(details.id).toBe("test-1");
	});

	it("SubagentJob includes abort function", () => {
		const job: SubagentJob = {
			id: "job-1",
			label: "test",
			model: "claude-sonnet-4",
			status: "running",
			startedAt: Date.now(),
			result: {} as SubagentDetails,
			abort: () => {},
		};
		expect(typeof job.abort).toBe("function");
	});
});
