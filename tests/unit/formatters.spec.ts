import type { Message } from "@mariozechner/pi-ai";
import { describe, expect, it } from "vitest";
import {
	applyThinkingSuffix,
	formatDuration,
	formatFinalOutput,
	formatTokens,
	formatToolCall,
	formatUsageStats,
} from "../../src/formatters";

describe("formatters", () => {
	describe("formatTokens", () => {
		it("formats small numbers as-is", () => {
			expect(formatTokens(42)).toBe("42");
			expect(formatTokens(999)).toBe("999");
		});

		it("formats thousands with k suffix", () => {
			expect(formatTokens(1200)).toBe("1.2k");
			expect(formatTokens(12345)).toBe("12k");
		});

		it("formats millions with M suffix", () => {
			expect(formatTokens(1500000)).toBe("1.5M");
		});
	});

	describe("formatDuration", () => {
		it("formats milliseconds under 1s", () => {
			expect(formatDuration(42)).toBe("42ms");
			expect(formatDuration(999)).toBe("999ms");
		});

		it("formats seconds under 1 minute", () => {
			expect(formatDuration(1234)).toBe("1.2s");
		});

		it("formats minutes and seconds", () => {
			expect(formatDuration(65000)).toBe("1m5s");
			expect(formatDuration(125000)).toBe("2m5s");
		});
	});

	describe("formatUsageStats", () => {
		it("formats basic usage", () => {
			const result = formatUsageStats({
				input: 1200,
				output: 340,
				cacheRead: 0,
				cacheWrite: 0,
				cost: 0.0021,
				turns: 3,
				contextTokens: 0,
			});
			expect(result).toContain("3 turns");
			expect(result).toContain("↑1.2k");
			expect(result).toContain("↓340");
			expect(result).toContain("$0.0021");
		});

		it("includes cache stats when present", () => {
			const result = formatUsageStats({
				input: 100,
				output: 50,
				cacheRead: 200,
				cacheWrite: 100,
				cost: 0,
				turns: 1,
				contextTokens: 500,
			});
			expect(result).toContain("R200");
			expect(result).toContain("W100");
			expect(result).toContain("ctx:500");
		});
	});

	describe("formatToolCall", () => {
		const fakeTheme = (_color: string, text: string) => text;

		it("formats bash commands", () => {
			const result = formatToolCall("bash", { command: "git status" }, fakeTheme);
			expect(result).toContain("$ git status");
		});

		it("formats read with path", () => {
			const result = formatToolCall("read", { path: "/home/user/src/file.ts" }, fakeTheme);
			expect(result).toContain("read");
			expect(result).toContain("file.ts");
		});

		it("formats read with offset and limit", () => {
			const result = formatToolCall(
				"read",
				{ path: "src/file.ts", offset: 10, limit: 20 },
				fakeTheme,
			);
			expect(result).toContain("10-29");
		});

		it("formats grep", () => {
			const result = formatToolCall("grep", { pattern: "jwt", path: "src/" }, fakeTheme);
			expect(result).toContain("/jwt/");
			expect(result).toContain("src/");
		});

		it("formats unknown tools generically", () => {
			const result = formatToolCall("custom_tool", { foo: "bar" }, fakeTheme);
			expect(result).toContain("custom_tool");
		});
	});

	describe("applyThinkingSuffix", () => {
		it("returns undefined when model is undefined", () => {
			expect(applyThinkingSuffix(undefined, "high")).toBeUndefined();
		});

		it("returns model unchanged when thinking is off or missing", () => {
			expect(applyThinkingSuffix("claude-sonnet", undefined)).toBe("claude-sonnet");
			expect(applyThinkingSuffix("claude-sonnet", "off")).toBe("claude-sonnet");
		});

		it("appends thinking suffix", () => {
			expect(applyThinkingSuffix("claude-sonnet", "high")).toBe("claude-sonnet:high");
		});

		it("is idempotent when model already has a valid thinking suffix", () => {
			expect(applyThinkingSuffix("claude-sonnet:medium", "high")).toBe("claude-sonnet:medium");
		});
	});

	describe("formatFinalOutput", () => {
		it("returns empty string for no messages", () => {
			expect(formatFinalOutput([])).toBe("");
		});

		it("returns the last assistant text part", () => {
			const messages = [
				{
					role: "assistant" as const,
					content: [{ type: "text" as const, text: "first" }],
				},
				{
					role: "user" as const,
					content: [{ type: "text" as const, text: "middle" }],
				},
				{
					role: "assistant" as const,
					content: [{ type: "text" as const, text: "last" }],
				},
			] as unknown as Message[];
			expect(formatFinalOutput(messages)).toBe("last");
		});

		it("skips assistant messages with no text parts", () => {
			const messages = [
				{
					role: "assistant" as const,
					content: [{ type: "text" as const, text: "first" }],
				},
				{
					role: "assistant" as const,
					content: [{ type: "tool_use" as const, id: "x", name: "bash", input: {} }],
				},
			] as unknown as Message[];
			expect(formatFinalOutput(messages)).toBe("first");
		});
	});
});
