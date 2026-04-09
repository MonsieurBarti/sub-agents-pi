import { describe, expect, it } from "vitest";
import {
	computeWidgetHash,
	pad,
	renderFooter,
	renderHeader,
	row,
	truncLine,
} from "../../src/render-helpers";
import type { SubagentJob } from "../../src/types";

// Theme stub that wraps its input with ANSI SGR codes we can inspect.
const ansiTheme = {
	fg: (color: string, text: string) => {
		const code =
			color === "border"
				? "\x1b[90m"
				: color === "accent"
					? "\x1b[36m"
					: color === "dim"
						? "\x1b[2m"
						: "\x1b[39m";
		return `${code}${text}\x1b[0m`;
	},
	bg: (_color: string, text: string) => text,
	bold: (text: string) => `\x1b[1m${text}\x1b[0m`,
};

describe("render-helpers", () => {
	describe("pad", () => {
		it("pads short strings to target width", () => {
			expect(pad("hi", 5)).toBe("hi   ");
		});

		it("returns string unchanged when already at or above width", () => {
			expect(pad("hello", 5)).toBe("hello");
			expect(pad("hello!", 5)).toBe("hello!");
		});

		it("ignores ANSI escape codes when computing width", () => {
			const styled = "\x1b[31mhi\x1b[0m";
			// Visible width is 2, so we need 3 extra spaces to hit 5.
			expect(pad(styled, 5)).toBe(`${styled}   `);
		});
	});

	describe("row", () => {
		it("wraps content in border chars padded to width", () => {
			// Width 10 → inner width 8 → "hi" + 6 spaces.
			const result = row("hi", 10, ansiTheme as never);
			// Starts with left border, ends with right border.
			expect(result).toMatch(/│/);
			expect(result).toContain("hi      ");
			// Two border characters total.
			expect(result.match(/│/g)?.length).toBe(2);
		});
	});

	describe("renderHeader", () => {
		it("produces top border with centered accent text", () => {
			const result = renderHeader("Sub-agents", 30, ansiTheme as never);
			expect(result).toContain("╭");
			expect(result).toContain("╮");
			expect(result).toContain("Sub-agents");
		});

		it("handles text longer than inner width", () => {
			const long = "x".repeat(50);
			expect(() => renderHeader(long, 20, ansiTheme as never)).not.toThrow();
		});
	});

	describe("renderFooter", () => {
		it("produces bottom border with centered dim text", () => {
			const result = renderFooter("esc close", 30, ansiTheme as never);
			expect(result).toContain("╰");
			expect(result).toContain("╯");
			expect(result).toContain("esc close");
		});
	});

	describe("truncLine", () => {
		it("returns input unchanged when already within width", () => {
			expect(truncLine("hello", 10)).toBe("hello");
			expect(truncLine("hello", 5)).toBe("hello");
		});

		it("truncates plain text and appends ellipsis", () => {
			expect(truncLine("abcdefghij", 5)).toBe("abcd…");
		});

		it("preserves active ANSI styles through the ellipsis", () => {
			// Red text, then reset. Truncating should keep the red style on the
			// ellipsis so the terminal doesn't bleed background colors.
			const styled = "\x1b[31mabcdefghij\x1b[0m";
			const result = truncLine(styled, 5);
			// Must contain the red code before the ellipsis.
			expect(result).toContain("\x1b[31m");
			expect(result).toContain("…");
			// Must not emit raw characters past the width budget.
			expect(result).not.toContain("fghij");
		});

		it("handles unicode graphemes correctly", () => {
			// 5 graphemes (emoji takes 2 cells each typically).
			const text = "abc🎯def";
			const result = truncLine(text, 4);
			// Should never split mid-grapheme and should fit in width budget.
			expect(result.endsWith("…")).toBe(true);
		});
	});

	describe("computeWidgetHash", () => {
		function makeJob(overrides: Partial<SubagentJob> = {}): SubagentJob {
			return {
				id: "a",
				label: "one",
				model: "m",
				status: "running",
				startedAt: 100,
				result: {
					id: "a",
					label: "one",
					model: "m",
					status: "running",
					startedAt: 100,
					task: "t",
					systemPrompt: "",
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
				abort: () => {},
				...overrides,
			};
		}

		it("returns the same hash for identical job lists", () => {
			const j1 = makeJob();
			const j2 = makeJob();
			expect(computeWidgetHash([j1])).toBe(computeWidgetHash([j2]));
		});

		it("returns different hashes when status changes", () => {
			const running = makeJob({ status: "running" });
			const done = makeJob({ status: "completed", endedAt: 200 });
			expect(computeWidgetHash([running])).not.toBe(computeWidgetHash([done]));
		});

		it("returns different hashes when count changes", () => {
			const one = [makeJob({ id: "a" })];
			const two = [makeJob({ id: "a" }), makeJob({ id: "b" })];
			expect(computeWidgetHash(one)).not.toBe(computeWidgetHash(two));
		});
	});
});
