import { beforeEach, describe, expect, it } from "vitest";
import { renderSubagentCall, renderSubagentResult } from "../../src/render";
import type { SubagentDetails } from "../../src/types";

const fakeTheme = {
	fg: (_color: string, text: string) => text,
	bg: (_color: string, text: string) => text,
	bold: (text: string) => text,
};

describe("render", () => {
	describe("renderSubagentCall", () => {
		it("renders label and model", () => {
			const component = renderSubagentCall(
				{
					task: "t",
					system_prompt: "sp",
					label: "scout",
					model: "claude-haiku-4-5",
					thinking: "low",
				},
				fakeTheme as unknown as Theme,
			);
			const lines = component.render(80);
			expect(lines.join("\n")).toContain("subagent");
			expect(lines.join("\n")).toContain("scout");
			expect(lines.join("\n")).toContain("claude-haiku-4-5:low");
		});

		it("uses 'subagent' as default label", () => {
			const component = renderSubagentCall(
				{ task: "t", system_prompt: "sp" },
				fakeTheme as unknown as Theme,
			);
			const lines = component.render(80);
			expect(lines.join("\n")).toContain("subagent");
		});
	});

	describe("renderSubagentResult", () => {
		let details: SubagentDetails;

		beforeEach(() => {
			details = {
				id: "test-1",
				label: "jwt-scout",
				model: "claude-haiku-4-5:low",
				status: "running",
				startedAt: Date.now() - 2300,
				task: "Find JWT parsing sites",
				systemPrompt: "You are a scout.",
				toolCalls: [
					{ name: "grep", args: { pattern: "jwt" } },
					{ name: "read", args: { path: "src/auth.ts" } },
				],
				currentTool: { name: "read", args: { path: "src/middleware.ts" } },
				usage: {
					input: 1200,
					output: 340,
					cacheRead: 0,
					cacheWrite: 0,
					cost: 0,
					turns: 3,
					contextTokens: 0,
				},
				messages: [],
				cwd: "/tmp",
			};
		});

		it("renders running state with tool calls", () => {
			const result = { content: [], details, isError: false };
			const component = renderSubagentResult(
				result as unknown as AgentToolResult<SubagentDetails>,
				{ expanded: false },
				fakeTheme as unknown as Theme,
			);
			const lines = component.render(80);
			const text = lines.join("\n");

			expect(text).toContain("jwt-scout");
			// Running shows ⏳ icon
			expect(text).toContain("⏳");
			expect(text).toContain("grep");
			expect(text).toContain("read");
		});

		it("renders completed state with final message", () => {
			details.status = "completed";
			details.endedAt = Date.now();
			details.messages = [
				{
					role: "assistant" as const,
					content: [{ type: "text" as const, text: "Found 3 sites." }],
				},
			];

			const result = { content: [], details, isError: false };
			const component = renderSubagentResult(
				result as unknown as AgentToolResult<SubagentDetails>,
				{ expanded: false },
				fakeTheme as unknown as Theme,
			);
			const lines = component.render(80);
			const text = lines.join("\n");

			expect(text).toContain("Found 3 sites.");
		});

		it("renders aborted state", () => {
			details.status = "aborted";
			details.endedAt = Date.now();

			const result = { content: [], details, isError: true };
			const component = renderSubagentResult(
				result as unknown as AgentToolResult<SubagentDetails>,
				{ expanded: false },
				fakeTheme as unknown as Theme,
			);
			const lines = component.render(80);
			const text = lines.join("\n");

			expect(text).toContain("stopped");
		});

		it("renders failed state with error", () => {
			details.status = "failed";
			details.endedAt = Date.now();
			details.error = "Model not found";

			const result = { content: [], details, isError: true };
			const component = renderSubagentResult(
				result as unknown as AgentToolResult<SubagentDetails>,
				{ expanded: false },
				fakeTheme as unknown as Theme,
			);
			const lines = component.render(80);
			const text = lines.join("\n");

			// Failed shows ✗ icon
			expect(text).toContain("✗");
			expect(text).toContain("Model not found");
		});

		it("shows expand hint for completed collapsed view", () => {
			details.status = "completed";
			details.endedAt = Date.now();
			details.messages = [
				{ role: "assistant" as const, content: [{ type: "text" as const, text: "Done" }] },
			];

			const result = { content: [], details, isError: false };
			const component = renderSubagentResult(
				result as unknown as AgentToolResult<SubagentDetails>,
				{ expanded: false },
				fakeTheme as unknown as Theme,
			);
			const lines = component.render(80);
			const text = lines.join("\n");

			// Should show completed message
			expect(text).toContain("Done");
		});
	});
});

import type { AgentToolResult } from "@mariozechner/pi-agent-core";
// Type imports
import type { Theme } from "@mariozechner/pi-coding-agent";
