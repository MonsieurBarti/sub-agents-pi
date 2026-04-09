import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { Message } from "@mariozechner/pi-ai";
import type { Theme } from "@mariozechner/pi-coding-agent";
import { Box, Container, Markdown, Spacer, Text } from "@mariozechner/pi-tui";
import { formatDuration, formatTokens, formatToolCall, formatUsageStats } from "./formatters";
import { applyThinkingSuffix } from "./pi-args";
import type { SubagentDetails, SubagentParamsT } from "./types";

export function renderSubagentCall(args: SubagentParamsT, theme: Theme): Container {
	const label = args.label ?? "subagent";
	const modelStr = applyThinkingSuffix(args.model, args.thinking) ?? "";

	const text =
		theme.fg("toolTitle", theme.bold("subagent ")) +
		theme.fg("accent", label) +
		(modelStr ? theme.fg("muted", ` · ${modelStr}`) : "");

	return new Text(text, 0, 0);
}

export function renderSubagentResult(
	result: AgentToolResult<SubagentDetails>,
	options: { expanded: boolean; isPartial?: boolean },
	theme: Theme,
): Container {
	const details = result.details;
	if (!details) return new Text("(no details)", 0, 0);

	const container = new Container();
	container.addChild(new Spacer(1));

	const boxTheme =
		details.status === "running"
			? "toolPendingBg"
			: result.isError
				? "toolErrorBg"
				: "toolSuccessBg";

	const box = new Box(1, 1, (text) => theme.bg(boxTheme, text));
	box.addChild(renderHeader(details, theme));
	box.addChild(new Spacer(1));
	box.addChild(
		options.expanded ? renderExpandedBody(details, theme) : renderCollapsedBody(details, theme),
	);

	if (!options.expanded && details.status === "completed") {
		box.addChild(new Spacer(1));
		box.addChild(new Text(theme.fg("muted", "(ctrl+o to expand)"), 0, 0));
	}

	container.addChild(box);
	return container;
}

function renderHeader(details: SubagentDetails, theme: Theme): Container {
	const container = new Container();

	const statusIcon =
		details.status === "running"
			? "⏳"
			: details.status === "completed"
				? "✓"
				: details.status === "aborted"
					? "⊘"
					: "✗";

	const elapsed = details.endedAt
		? formatDuration(details.endedAt - details.startedAt)
		: formatDuration(Date.now() - details.startedAt);

	let header = theme.bold(`${statusIcon} subagent ${details.label}`);
	if (details.model) header += theme.fg("muted", ` · ${details.model}`);
	header += theme.fg("muted", ` · ${elapsed}`);

	if (details.usage.turns > 0) {
		header += theme.fg("muted", ` · ${details.usage.turns}t`);
		header += theme.fg(
			"muted",
			` · ↑${formatTokens(details.usage.input)} ↓${formatTokens(details.usage.output)}`,
		);
	}

	container.addChild(new Text(header, 0, 0));
	return container;
}

function renderCollapsedBody(details: SubagentDetails, theme: Theme): Container {
	const container = new Container();

	if (details.status === "running") {
		// Show recent tool calls
		const recentCalls = details.toolCalls.slice(-10);
		for (const call of recentCalls) {
			const formatted = formatToolCall(call.name, call.args, (c, t) => theme.fg(c, t));
			container.addChild(new Text(`  ${formatted}`, 0, 0));
		}
		if (details.currentTool) {
			const formatted = formatToolCall(details.currentTool.name, details.currentTool.args, (c, t) =>
				theme.fg(c, t),
			);
			container.addChild(new Text(theme.fg("warning", "▸ ") + formatted, 0, 0));
		}
	} else if (details.status === "aborted") {
		const recentCalls = details.toolCalls.slice(-10);
		for (const call of recentCalls) {
			const formatted = formatToolCall(call.name, call.args, (c, t) => theme.fg(c, t));
			container.addChild(new Text(`  ${formatted}`, 0, 0));
		}
		container.addChild(new Spacer(1));
		container.addChild(new Text(theme.fg("muted", "⊘ sub-agent stopped before completion"), 0, 0));
	} else if (details.status === "failed") {
		if (details.error) {
			container.addChild(new Text(theme.fg("error", `Error: ${details.error}`), 0, 0));
		}
		if (details.stderr) {
			container.addChild(new Text(theme.fg("muted", details.stderr.slice(0, 200)), 0, 0));
		}
	} else {
		// Completed - show final message
		const finalText = getFinalOutput(details.messages);
		if (finalText) {
			container.addChild(new Text(finalText, 0, 0));
		}
	}

	return container;
}

function renderExpandedBody(details: SubagentDetails, theme: Theme): Container {
	const container = new Container();

	// Task
	container.addChild(new Text(theme.fg("muted", "Task:"), 0, 0));
	container.addChild(new Text(details.task, 0, 0));
	container.addChild(new Spacer(1));

	// System prompt excerpt
	const promptExcerpt =
		details.systemPrompt.length > 200
			? `${details.systemPrompt.slice(0, 200)}…`
			: details.systemPrompt;
	container.addChild(new Text(theme.fg("muted", "System prompt:"), 0, 0));
	container.addChild(new Text(promptExcerpt, 0, 0));
	container.addChild(new Spacer(1));

	// All tool calls
	if (details.toolCalls.length > 0) {
		container.addChild(new Text(theme.fg("muted", "Tool calls:"), 0, 0));
		for (const call of details.toolCalls) {
			const formatted = formatToolCall(call.name, call.args, (c, t) => theme.fg(c, t));
			container.addChild(new Text(`  ${formatted}`, 0, 0));
		}
		container.addChild(new Spacer(1));
	}

	// Final message as Markdown
	const finalText = getFinalOutput(details.messages);
	if (finalText) {
		container.addChild(new Markdown(finalText, theme));
	}

	// Usage stats
	container.addChild(new Spacer(1));
	container.addChild(new Text(theme.fg("muted", formatUsageStats(details.usage)), 0, 0));

	return container;
}

function getFinalOutput(messages: Message[]): string {
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];
		if (msg?.role === "assistant") {
			for (const part of msg.content) {
				if (part.type === "text") return part.text;
			}
		}
	}
	return "";
}
