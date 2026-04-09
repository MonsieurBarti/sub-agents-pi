import { StringEnum } from "@mariozechner/pi-ai";
import type { Message } from "@mariozechner/pi-ai";
import { type Static, Type } from "@sinclair/typebox";

export const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;

// ---------------------------------------------------------------------
// Tool parameters (what the LLM passes)
// ---------------------------------------------------------------------

export const SubagentParams = Type.Object({
	task: Type.String({ description: "The task prompt to send to the sub-agent." }),
	system_prompt: Type.String({ description: "The sub-agent's identity/instructions." }),
	label: Type.Optional(Type.String({ description: "Short display name for the TUI." })),
	model: Type.Optional(Type.String({ description: "Model id (e.g. 'claude-sonnet-4-5')." })),
	thinking: Type.Optional(StringEnum(THINKING_LEVELS, { description: "Thinking level." })),
	cwd: Type.Optional(Type.String({ description: "Working directory for child pi." })),
	tools: Type.Optional(Type.Array(Type.String(), { description: "Builtin tool allowlist." })),
});

export type SubagentParamsT = Static<typeof SubagentParams>;

// ---------------------------------------------------------------------
// Runtime state (what we track during execution)
// ---------------------------------------------------------------------

export interface UsageStats {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
	turns: number;
	contextTokens: number;
}

export interface ToolCallRecord {
	name: string;
	args: Record<string, unknown>;
	startedAt?: number;
	endedAt?: number;
}

export interface SubagentDetails {
	id: string;
	label: string;
	model: string | null;
	status: "running" | "completed" | "failed" | "aborted";
	startedAt: number;
	endedAt?: number;
	task: string;
	systemPrompt: string;
	toolCalls: ToolCallRecord[];
	currentTool: ToolCallRecord | null;
	usage: UsageStats;
	messages: Message[];
	cwd: string;
	stderr?: string;
	error?: string;
}

// ---------------------------------------------------------------------
// Job pool entry (shared state across calls)
// ---------------------------------------------------------------------

export interface SubagentJob {
	id: string;
	label: string;
	model: string | null;
	status: "running" | "completed" | "failed" | "aborted";
	startedAt: number;
	endedAt?: number;
	result: SubagentDetails;
	abort: () => void;
}

// ---------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------

export const WIDGET_KEY = "subagents";
