import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import registerExtension from "../../src/index";
import { spawn } from "../../src/spawn";

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
		await expect(spawn(null, { task: "t", system_prompt: "sp" })).rejects.toThrow(
			"spawn() called before registerSubagentExtension()",
		);
	});

	it("returns { success: true, output } on successful execution", async () => {
		const { getSharedState } = await import("../../src/index");
		const pi = makeMockPi();
		registerExtension(pi);

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
