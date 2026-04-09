import { beforeEach, describe, expect, it, vi } from "vitest";
import { JobPool } from "../../src/job-pool";
import { SubagentPanel } from "../../src/panel";
import type { SubagentDetails, SubagentJob } from "../../src/types";

const fakeTheme = {
	fg: (_color: string, text: string) => text,
	bg: (_color: string, text: string) => text,
	bold: (text: string) => text,
};

function makeJob(overrides: Partial<SubagentJob> = {}): SubagentJob {
	return {
		id: "test-1",
		label: "scout",
		model: "claude-haiku-4-5",
		status: "running",
		startedAt: Date.now(),
		result: {
			id: "test-1",
			label: "scout",
			model: "claude-haiku-4-5",
			status: "running",
			startedAt: Date.now(),
			task: "Find stuff",
			systemPrompt: "You are a scout",
			toolCalls: [],
			currentTool: null,
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
		},
		abort: vi.fn(),
		...overrides,
	};
}

describe("SubagentPanel", () => {
	let pool: JobPool;
	let done: ReturnType<typeof vi.fn>;
	let panel: SubagentPanel;
	let tui: { requestRender: ReturnType<typeof vi.fn> };

	beforeEach(() => {
		pool = new JobPool();
		done = vi.fn();
		tui = { requestRender: vi.fn() };
		panel = new SubagentPanel(pool, tui, fakeTheme as unknown as Theme, done);
	});

	describe("handleInput", () => {
		it("closes on escape", () => {
			panel.handleInput("\x1b"); // escape
			expect(done).toHaveBeenCalled();
		});

		it("closes on ctrl+c", () => {
			panel.handleInput("\x03"); // ctrl+c
			expect(done).toHaveBeenCalled();
		});

		it("moves selection down with down arrow", () => {
			pool.add(makeJob({ id: "1", label: "a" }));
			pool.add(makeJob({ id: "2", label: "b" }));

			expect(panel.getSelectedIndex()).toBe(0);
			panel.handleInput("\x1b[B"); // down
			expect(panel.getSelectedIndex()).toBe(1);
		});

		it("moves selection up with up arrow", () => {
			pool.add(makeJob({ id: "1", label: "a" }));
			pool.add(makeJob({ id: "2", label: "b" }));

			panel.handleInput("\x1b[B"); // down
			expect(panel.getSelectedIndex()).toBe(1);
			panel.handleInput("\x1b[A"); // up
			expect(panel.getSelectedIndex()).toBe(0);
		});

		it("clamps selection to bounds", () => {
			pool.add(makeJob({ id: "1", label: "a" }));

			panel.handleInput("\x1b[A"); // up
			expect(panel.getSelectedIndex()).toBe(0);
			panel.handleInput("\x1b[B"); // down
			expect(panel.getSelectedIndex()).toBe(0);
		});

		it("toggles zoom on enter", () => {
			pool.add(makeJob());

			expect(panel.isZoomed()).toBe(false);
			panel.handleInput("\r"); // enter
			expect(panel.isZoomed()).toBe(true);
			panel.handleInput("\r"); // enter again
			expect(panel.isZoomed()).toBe(false);
		});

		it("exits zoom on escape", () => {
			pool.add(makeJob());

			panel.handleInput("\r"); // enter to zoom
			expect(panel.isZoomed()).toBe(true);

			panel.handleInput("\x1b"); // escape
			expect(panel.isZoomed()).toBe(false);
			expect(done).not.toHaveBeenCalled();
		});

		it("kills selected job on k", () => {
			const abort = vi.fn();
			pool.add(makeJob({ abort }));

			panel.handleInput("k");
			expect(abort).toHaveBeenCalled();
		});

		it("does not kill non-running job on k", () => {
			const abort = vi.fn();
			pool.add(makeJob({ status: "completed", abort }));

			panel.handleInput("k");
			expect(abort).not.toHaveBeenCalled();
		});
	});

	describe("render", () => {
		it("shows 'no sub-agents' when pool is empty", () => {
			const lines = panel.render(80);
			expect(lines.join("\n")).toContain("No sub-agents");
		});

		it("shows list in split view", () => {
			pool.add(makeJob({ id: "1", label: "scout" }));
			pool.add(makeJob({ id: "2", label: "planner" }));

			const lines = panel.render(80);
			const text = lines.join("\n");
			expect(text).toContain("scout");
			expect(text).toContain("planner");
		});

		it("shows detail in zoomed view", () => {
			pool.add(makeJob({ id: "1", label: "scout", status: "running" }));

			panel.handleInput("\r"); // zoom
			const lines = panel.render(80);
			const text = lines.join("\n");
			expect(text).toContain("Find stuff"); // task
		});
	});

	describe("pool subscription", () => {
		it("requests a render on pool change", () => {
			pool.add(makeJob());

			expect(tui.requestRender).toHaveBeenCalled();
		});

		it("unsubscribes on dispose", () => {
			panel.dispose();
			tui.requestRender.mockClear();
			pool.add(makeJob());

			expect(tui.requestRender).not.toHaveBeenCalled();
		});
	});
});

// Type imports
import type { Theme } from "@mariozechner/pi-coding-agent";
