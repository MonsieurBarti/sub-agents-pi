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
	toolCallId?: string;
	args: Record<string, unknown>;
	startedAt?: number;
	endedAt?: number;
	result?: unknown;
	isError?: boolean;
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
	/**
	 * In-flight tool calls keyed by toolCallId. Interleaved starts/ends from
	 * pi's agent loop require we match on id rather than assume strict pairing.
	 * For display (e.g. the "▸ current tool" indicator), callers typically show
	 * the most-recently-started entry — see getCurrentTool().
	 */
	currentTools: Map<string, ToolCallRecord>;
	usage: UsageStats;
	messages: Message[];
	cwd: string;
	stderr?: string;
	error?: string;
}

/**
 * Return the most-recently-started in-flight tool, or null if none.
 * Safe to call from render paths; preserves Map iteration order.
 */
export function getCurrentTool(details: SubagentDetails): ToolCallRecord | null {
	let latest: ToolCallRecord | null = null;
	for (const record of details.currentTools.values()) {
		latest = record;
	}
	return latest;
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
