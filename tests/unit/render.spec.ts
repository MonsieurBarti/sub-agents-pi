import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { Message } from "@mariozechner/pi-ai";
import type { Theme } from "@mariozechner/pi-coding-agent";
import { beforeEach, describe, expect, it } from "vitest";
import { renderSubagentCall, renderSubagentResult } from "../../src/render";
import type { SubagentDetails } from "../../src/types";

const fakeTheme = {
	fg: (_color: string, text: string) => text,
	bg: (_color: string, text: string) => text,
	bold: (text: string) => text,
};

function makeMessage(role: "assistant", content: string): Message {
	return {
		role,
		content: [{ type: "text", text: content }],
		api: "anthropic" as const,
		provider: "anthropic" as const,
		model: "claude-sonnet-4",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop" as const,
		timestamp: Date.now(),
	} as Message;
}

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
				currentTools: new Map([
					[
						"call_1",
						{
							name: "read",
							toolCallId: "call_1",
							args: { path: "src/middleware.ts" },
							startedAt: Date.now(),
						},
					],
				]),
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
			const result = { content: [], details };
			const component = renderSubagentResult(
				result as AgentToolResult<SubagentDetails>,
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
			details.messages = [makeMessage("assistant", "Found 3 sites.")];

			const result = { content: [], details };
			const component = renderSubagentResult(
				result as AgentToolResult<SubagentDetails>,
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

			const result = { content: [], details };
			const component = renderSubagentResult(
				result as AgentToolResult<SubagentDetails>,
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

			const result = { content: [], details };
			const component = renderSubagentResult(
				result as AgentToolResult<SubagentDetails>,
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
			details.messages = [makeMessage("assistant", "Done")];

			const result = { content: [], details };
			const component = renderSubagentResult(
				result as AgentToolResult<SubagentDetails>,
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
