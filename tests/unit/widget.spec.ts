import { describe, expect, it, vi } from "vitest";
import { JobPool } from "../../src/job-pool";
import { WIDGET_KEY } from "../../src/types";
import { updateWidget } from "../../src/widget";

function makeContext() {
	return {
		hasUI: true,
		ui: {
			setWidget: vi.fn(),
		},
	} as unknown as ExtensionContext;
}

describe("widget", () => {
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
			pool.add({
				id: "1",
				label: "a",
				model: null,
				status: "running",
				startedAt: Date.now(),
				result: {} as SubagentDetails,
				abort: vi.fn(),
			});

			updateWidget(ctx, pool);

			expect(ctx.ui.setWidget).toHaveBeenCalledWith(WIDGET_KEY, expect.any(Function), {
				placement: "belowEditor",
			});

			// Test the factory function
			const factory = ctx.ui.setWidget.mock.calls[0][1];
			const component = factory(null as unknown as TUI, { fg: (_c: string, t: string) => t });
			const lines = component.render(80);
			expect(lines.join("\n")).toContain("1 running");
		});

		it("shows done count", () => {
			const ctx = makeContext();
			const pool = new JobPool();
			pool.add({
				id: "1",
				label: "a",
				model: null,
				status: "completed",
				startedAt: Date.now(),
				result: {} as SubagentDetails,
				abort: vi.fn(),
			});

			updateWidget(ctx, pool);

			const factory = ctx.ui.setWidget.mock.calls[0][1];
			const component = factory(null as unknown as TUI, { fg: (_c: string, t: string) => t });
			const lines = component.render(80);
			expect(lines.join("\n")).toContain("1 done");
		});

		it("shows both running and done", () => {
			const ctx = makeContext();
			const pool = new JobPool();
			pool.add({
				id: "1",
				label: "a",
				model: null,
				status: "running",
				startedAt: Date.now(),
				result: {} as SubagentDetails,
				abort: vi.fn(),
			});
			pool.add({
				id: "2",
				label: "b",
				model: null,
				status: "completed",
				startedAt: Date.now(),
				result: {} as SubagentDetails,
				abort: vi.fn(),
			});

			updateWidget(ctx, pool);

			const factory = ctx.ui.setWidget.mock.calls[0][1];
			const component = factory(null as unknown as TUI, { fg: (_c: string, t: string) => t });
			const lines = component.render(80);
			expect(lines.join("\n")).toContain("1 running");
			expect(lines.join("\n")).toContain("1 done");
		});

		it("does nothing when hasUI is false", () => {
			const ctx = { hasUI: false, ui: { setWidget: vi.fn() } } as unknown as ExtensionContext;
			const pool = new JobPool();
			pool.add({
				id: "1",
				label: "a",
				model: null,
				status: "running",
				startedAt: Date.now(),
				result: {} as SubagentDetails,
				abort: vi.fn(),
			});

			updateWidget(ctx, pool);
			expect(ctx.ui.setWidget).not.toHaveBeenCalled();
		});
	});
});

// Type imports
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { TUI } from "@mariozechner/pi-tui";
import type { SubagentDetails } from "../../src/types";
