import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { TUI } from "@mariozechner/pi-tui";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { JobPool } from "../../src/job-pool";
import type { SubagentDetails, SubagentJob } from "../../src/types";
import { WIDGET_KEY } from "../../src/types";
import { resetWidgetCache, updateWidget } from "../../src/widget";

function makeContext() {
	return {
		hasUI: true,
		ui: {
			setWidget: vi.fn(),
		},
	} as unknown as ExtensionContext;
}

function makeDetails(overrides: Partial<SubagentDetails> = {}): SubagentDetails {
	return {
		id: "1",
		label: "a",
		model: null,
		status: "running",
		startedAt: Date.now(),
		task: "t",
		systemPrompt: "",
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
		...overrides,
	};
}

function makeJob(overrides: Partial<SubagentJob> = {}): SubagentJob {
	const id = overrides.id ?? "1";
	return {
		id,
		label: "a",
		model: null,
		status: "running",
		startedAt: Date.now(),
		result: makeDetails({ id, status: overrides.status ?? "running" }),
		abort: vi.fn(),
		...overrides,
	};
}

describe("widget", () => {
	beforeEach(() => {
		// Dedupe cache is module-scoped — tests must start fresh or they'll
		// see stale hash state from the previous test.
		resetWidgetCache();
	});

	describe("updateWidget", () => {
		it("hides widget when pool is empty", () => {
			const ctx = makeContext();
			const pool = new JobPool();
			updateWidget(ctx, pool);
			expect(ctx.ui.setWidget).toHaveBeenCalledWith(WIDGET_KEY, undefined);
		});

		it("shows running count", () => {
			const ctx = makeContext();
			const pool = new JobPool();
			pool.add(makeJob({ status: "running" }));

			updateWidget(ctx, pool);

			expect(ctx.ui.setWidget).toHaveBeenCalledWith(WIDGET_KEY, expect.any(Function), {
				placement: "belowEditor",
			});

			// Test the factory function
			const calls = (ctx.ui.setWidget as ReturnType<typeof vi.fn>).mock.calls;
			const factory = calls[0]?.[1] as (
				tui: TUI,
				theme: { fg: (c: string, t: string) => string },
			) => { render: (w: number) => string[] };
			const component = factory(null as unknown as TUI, { fg: (_c: string, t: string) => t });
			const lines = component.render(80);
			expect(lines.join("\n")).toContain("1 running");
		});

		it("shows done count", () => {
			const ctx = makeContext();
			const pool = new JobPool();
			pool.add(makeJob({ id: "1", status: "completed" }));

			updateWidget(ctx, pool);

			const calls = (ctx.ui.setWidget as ReturnType<typeof vi.fn>).mock.calls;
			const factory = calls[0]?.[1] as (
				tui: TUI,
				theme: { fg: (c: string, t: string) => string },
			) => { render: (w: number) => string[] };
			const component = factory(null as unknown as TUI, { fg: (_c: string, t: string) => t });
			const lines = component.render(80);
			expect(lines.join("\n")).toContain("1 done");
		});

		it("shows both running and done", () => {
			const ctx = makeContext();
			const pool = new JobPool();
			pool.add(makeJob({ id: "1", status: "running" }));
			pool.add(makeJob({ id: "2", status: "completed" }));

			updateWidget(ctx, pool);

			const calls = (ctx.ui.setWidget as ReturnType<typeof vi.fn>).mock.calls;
			const factory = calls[0]?.[1] as (
				tui: TUI,
				theme: { fg: (c: string, t: string) => string },
			) => { render: (w: number) => string[] };
			const component = factory(null as unknown as TUI, { fg: (_c: string, t: string) => t });
			const lines = component.render(80);
			expect(lines.join("\n")).toContain("1 running");
			expect(lines.join("\n")).toContain("1 done");
		});

		it("does nothing when hasUI is false", () => {
			const ctx = { hasUI: false, ui: { setWidget: vi.fn() } } as unknown as ExtensionContext;
			const pool = new JobPool();
			pool.add(makeJob());

			updateWidget(ctx, pool);
			expect(ctx.ui.setWidget).not.toHaveBeenCalled();
		});
	});
});
