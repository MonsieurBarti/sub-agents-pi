import type { Theme } from "@mariozechner/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@mariozechner/pi-tui";
import { matchesKey } from "@mariozechner/pi-tui";
import type { Component } from "@mariozechner/pi-tui";
import { formatDuration, formatToolCall, formatUsageStats } from "./formatters";
import type { JobPool } from "./job-pool";
import type { SubagentJob } from "./types";

export class SubagentPanel implements Component {
	private selectedIndex = 0;
	private zoomed = false;
	private handler: () => void;

	constructor(
		private pool: JobPool,
		private theme: Theme,
		private done: () => void,
	) {
		this.handler = () => this.invalidate();
		this.pool.on("change", this.handler);
	}

	// Test-only accessors
	getSelectedIndex(): number {
		return this.selectedIndex;
	}

	isZoomed(): boolean {
		return this.zoomed;
	}

	handleInput(data: string): void {
		const jobs = this.pool.list();

		if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
			if (this.zoomed) {
				this.zoomed = false;
				this.invalidate();
				return;
			}
			this.done();
			return;
		}

		if (matchesKey(data, "up")) {
			this.selectedIndex = Math.max(0, this.selectedIndex - 1);
			this.invalidate();
			return;
		}

		if (matchesKey(data, "down")) {
			this.selectedIndex = Math.min(jobs.length - 1, this.selectedIndex + 1);
			this.invalidate();
			return;
		}

		if (matchesKey(data, "return")) {
			this.zoomed = !this.zoomed;
			this.invalidate();
			return;
		}

		if (matchesKey(data, "k")) {
			const job = jobs[this.selectedIndex];
			if (job && job.status === "running") {
				this.pool.kill(job.id);
			}
			return;
		}
	}

	render(width: number): string[] {
		const jobs = this.pool.list();

		if (jobs.length === 0) {
			return [this.theme.fg("muted", "No sub-agents.")];
		}

		this.selectedIndex = Math.min(this.selectedIndex, jobs.length - 1);

		return this.zoomed
			? this.renderZoomed(jobs[this.selectedIndex], width)
			: this.renderSplit(jobs, width);
	}

	private renderSplit(jobs: SubagentJob[], width: number): string[] {
		const container = new Container();

		// Header
		container.addChild(new Text(this.theme.bold("🧬 Sub-agents"), 0, 0));
		container.addChild(new Spacer(1));

		// Two-pane layout (simplified: left = list, right = detail)
		const leftWidth = Math.floor(width * 0.35);
		const rightWidth = width - leftWidth - 3;

		// Left pane: list
		const leftPane = new Container();
		for (let i = 0; i < jobs.length; i++) {
			const job = jobs[i];
			if (!job) continue;
			const prefix = i === this.selectedIndex ? this.theme.fg("warning", "▸") : " ";
			const icon =
				job.status === "running"
					? "⏳"
					: job.status === "completed"
						? "✓"
						: job.status === "aborted"
							? "⊘"
							: "✗";
			leftPane.addChild(new Text(`${prefix}${icon} ${job.label}`, 0, 0));
			leftPane.addChild(new Text(this.theme.fg("muted", `   ${job.model || "default"}`), 0, 0));
			const elapsed = job.endedAt
				? formatDuration(job.endedAt - job.startedAt)
				: formatDuration(Date.now() - job.startedAt);
			leftPane.addChild(new Text(this.theme.fg("dim", `   ${elapsed}`), 0, 0));
		}

		// Right pane: detail
		const selectedJob = jobs[this.selectedIndex];
		if (!selectedJob) {
			return container.render(width);
		}
		const rightPane = this.renderDetail(selectedJob, rightWidth);

		// Combine panes (simplified: render both and join lines)
		const leftLines = leftPane.render(leftWidth);
		const rightLines = rightPane.render(rightWidth);

		const maxLines = Math.max(leftLines.length, rightLines.length);
		for (let i = 0; i < maxLines; i++) {
			const left = leftLines[i] ?? "";
			const right = rightLines[i] ?? "";
			container.addChild(new Text(`${left.padEnd(leftWidth)} │ ${right}`, 0, 0));
		}

		// Footer
		container.addChild(new Spacer(1));
		container.addChild(new Text("↑↓ select · enter zoom · k kill · esc close", 0, 0));

		return container.render(width);
	}

	private renderZoomed(job: SubagentJob, width: number): string[] {
		const container = new Container();

		// Header
		const icon =
			job.status === "running"
				? "⏳"
				: job.status === "completed"
					? "✓"
					: job.status === "aborted"
						? "⊘"
						: "✗";
		container.addChild(new Text(this.theme.bold(`${icon} ${job.label}`), 0, 0));
		container.addChild(new Spacer(1));

		// Detail
		container.addChild(this.renderDetail(job, width));

		// Footer
		container.addChild(new Spacer(1));
		container.addChild(new Text("esc back · k kill", 0, 0));

		return container.render(width);
	}

	private renderDetail(job: SubagentJob, _width: number): Container {
		const container = new Container();
		const d = job.result;

		// Model + elapsed
		const elapsed = d.endedAt
			? formatDuration(d.endedAt - d.startedAt)
			: formatDuration(Date.now() - d.startedAt);
		container.addChild(new Text(`${d.model || "default"} · ${d.status} · ${elapsed}`, 0, 0));
		container.addChild(new Spacer(1));

		// Task
		container.addChild(new Text(this.theme.fg("muted", "Task:"), 0, 0));
		container.addChild(new Text(d.task.slice(0, 100), 0, 0));
		container.addChild(new Spacer(1));

		// Tool calls
		if (d.toolCalls.length > 0 || d.currentTool) {
			container.addChild(new Text(this.theme.fg("muted", "Tool calls:"), 0, 0));
			for (const call of d.toolCalls.slice(-5)) {
				const formatted = formatToolCall(call.name, call.args, (c, t) => this.theme.fg(c, t));
				container.addChild(new Text(`  ${formatted}`, 0, 0));
			}
			if (d.currentTool) {
				const formatted = formatToolCall(d.currentTool.name, d.currentTool.args, (c, t) =>
					this.theme.fg(c, t),
				);
				container.addChild(new Text(this.theme.fg("warning", "▸ ") + formatted, 0, 0));
			}
			container.addChild(new Spacer(1));
		}

		// Final message
		const finalText = this.getFinalOutput(d.messages);
		if (finalText && d.status !== "running") {
			container.addChild(new Markdown(finalText, this.theme));
		}

		// Usage
		if (d.usage.turns > 0) {
			container.addChild(new Spacer(1));
			container.addChild(new Text(this.theme.fg("muted", formatUsageStats(d.usage)), 0, 0));
		}

		return container;
	}

	private getFinalOutput(messages: SubagentJob["result"]["messages"]): string {
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

	invalidate(): void {
		// Base Component class handles this - stub for test spying
	}

	dispose(): void {
		this.pool.off("change", this.handler);
	}
}
