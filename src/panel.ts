import { type Theme, type ThemeColor, getMarkdownTheme } from "@mariozechner/pi-coding-agent";
import { Markdown, matchesKey, visibleWidth } from "@mariozechner/pi-tui";
import type { Component } from "@mariozechner/pi-tui";
import { formatDuration, formatFinalOutput, formatToolCall, formatUsageStats } from "./formatters";
import type { JobPool } from "./job-pool";
import { pad, renderFooter, renderHeader, truncLine } from "./render-helpers";
import { type SubagentJob, getCurrentTool } from "./types";

/**
 * Minimal slice of the pi-tui TUI interface we depend on. Using a narrow
 * structural type keeps tests simple (no need to construct a real TUI) and
 * documents the only capability we require from the host.
 */
export interface PanelTUI {
	requestRender(): void;
}

/**
 * Callback used to prompt the user before destructive actions. In production
 * this is `ctx.ui.confirm`; tests can pass a vi.fn() to drive the flow.
 */
export type ConfirmFn = (title: string, message: string) => Promise<boolean>;

export class SubagentPanel implements Component {
	private selectedIndex = 0;
	private zoomed = false;
	private handler: () => void;
	/** Set while a confirm dialog for this panel is in flight — blocks re-entry. */
	private confirmInFlight = false;

	constructor(
		private pool: JobPool,
		private tui: PanelTUI,
		private theme: Theme,
		private done: () => void,
		private confirm: ConfirmFn,
	) {
		// Pool changes arrive asynchronously from background sub-agents. The
		// TUI only renders on input by default, so we must explicitly request
		// a render to reflect state changes while the panel is open.
		this.handler = () => {
			this.clampSelection();
			this.tui.requestRender();
		};
		this.pool.on("change", this.handler);
	}

	private clampSelection(): void {
		const len = this.pool.list().length;
		if (len === 0) {
			this.selectedIndex = 0;
			return;
		}
		if (this.selectedIndex < 0) this.selectedIndex = 0;
		if (this.selectedIndex >= len) this.selectedIndex = len - 1;
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
				this.tui.requestRender();
				return;
			}
			this.done();
			return;
		}

		if (matchesKey(data, "up")) {
			this.selectedIndex = Math.max(0, this.selectedIndex - 1);
			this.tui.requestRender();
			return;
		}

		if (matchesKey(data, "down")) {
			this.selectedIndex = Math.min(jobs.length - 1, this.selectedIndex + 1);
			this.tui.requestRender();
			return;
		}

		if (matchesKey(data, "return")) {
			this.zoomed = !this.zoomed;
			this.tui.requestRender();
			return;
		}

		if (matchesKey(data, "k")) {
			if (this.confirmInFlight) return;
			const job = jobs[this.selectedIndex];
			if (!job || job.status !== "running") return;

			this.confirmInFlight = true;
			const confirmPromise = this.confirm(
				"Kill sub-agent?",
				`${job.label} will receive SIGTERM (then SIGKILL after 3s).`,
			);
			confirmPromise
				.then((ok) => {
					if (ok) this.pool.kill(job.id);
				})
				.finally(() => {
					this.confirmInFlight = false;
					this.tui.requestRender();
				});
			return;
		}
	}

	render(width: number): string[] {
		const jobs = this.pool.list();

		if (jobs.length === 0) {
			return [this.theme.fg("muted", "No sub-agents.")];
		}

		// Defensive: fall back to index 0 rather than crashing if something
		// mutated the pool between clamp and render.
		const index = Math.max(0, Math.min(this.selectedIndex, jobs.length - 1));
		const selected = jobs[index];
		if (!selected) {
			return [this.theme.fg("muted", "No sub-agents.")];
		}

		return this.zoomed ? this.renderZoomed(selected, width) : this.renderSplit(jobs, width);
	}

	private renderSplit(jobs: SubagentJob[], width: number): string[] {
		const lines: string[] = [];
		lines.push(renderHeader("🧬 Sub-agents", width, this.theme));

		// Two-pane layout with a border between them. Total width budget:
		//   │ leftPane │ rightPane │
		// = 1 + leftW + 1 + rightW + 1 border cells = width
		const innerW = Math.max(0, width - 4); // subtract 4 border chars
		const leftW = Math.max(12, Math.floor(innerW * 0.35));
		const rightW = Math.max(0, innerW - leftW);

		const leftLines = this.renderListPane(jobs, leftW);
		const focus = jobs[this.selectedIndex] ?? jobs[0];
		if (!focus) return [];
		const rightLines = this.renderDetailLines(focus, rightW);

		const rowCount = Math.max(leftLines.length, rightLines.length);
		const borderFg = (t: string) => this.theme.fg("border", t);
		for (let i = 0; i < rowCount; i++) {
			const left = leftLines[i] ?? "";
			const right = rightLines[i] ?? "";
			lines.push(
				borderFg("│") +
					pad(truncLine(left, leftW), leftW) +
					borderFg("│") +
					pad(truncLine(right, rightW), rightW) +
					borderFg("│"),
			);
		}

		lines.push(renderFooter("↑↓ select · enter zoom · k kill · esc close", width, this.theme));
		return lines;
	}

	private renderListPane(jobs: SubagentJob[], width: number): string[] {
		const lines: string[] = [];
		for (let i = 0; i < jobs.length; i++) {
			const job = jobs[i];
			if (!job) continue;
			const selected = i === this.selectedIndex;
			const prefix = selected ? this.theme.fg("warning", "▸") : " ";
			const icon = statusIcon(job.status);
			const label = selected ? this.theme.bold(job.label) : this.theme.fg("toolTitle", job.label);
			lines.push(`${prefix}${icon} ${label}`);
			lines.push(this.theme.fg("muted", `  ${job.model || "default"}`));
			const elapsed = job.endedAt
				? formatDuration(job.endedAt - job.startedAt)
				: formatDuration(Date.now() - job.startedAt);
			lines.push(this.theme.fg("dim", `  ${elapsed}`));
			// visual separator, unless last row — render-helpers `pad` in
			// renderSplit will fill empty cells.
			if (i < jobs.length - 1) lines.push("");
		}
		// Drop cells that exceed the pane width to keep the border aligned.
		return lines.map((l) => (visibleWidth(l) > width ? truncLine(l, width) : l));
	}

	private renderZoomed(job: SubagentJob, width: number): string[] {
		const lines: string[] = [];
		lines.push(renderHeader(`${statusIcon(job.status)} ${job.label}`, width, this.theme));

		const innerW = Math.max(0, width - 2);
		const borderFg = (t: string) => this.theme.fg("border", t);
		const detailLines = this.renderDetailLines(job, innerW);
		for (const l of detailLines) {
			lines.push(borderFg("│") + pad(truncLine(l, innerW), innerW) + borderFg("│"));
		}

		lines.push(renderFooter("esc back · k kill", width, this.theme));
		return lines;
	}

	private renderDetailLines(job: SubagentJob, width: number): string[] {
		const lines: string[] = [];
		const d = job.result;
		const themeFg = (c: ThemeColor, t: string) => this.theme.fg(c, t);

		// Header row: model · status · elapsed
		const elapsed = d.endedAt
			? formatDuration(d.endedAt - d.startedAt)
			: formatDuration(Date.now() - d.startedAt);
		const statusColor =
			d.status === "running"
				? "warning"
				: d.status === "completed"
					? "success"
					: d.status === "aborted"
						? "muted"
						: "error";
		lines.push(
			this.theme.fg("accent", d.model || "default") +
				this.theme.fg("dim", " · ") +
				this.theme.fg(statusColor, d.status) +
				this.theme.fg("dim", " · ") +
				this.theme.fg("muted", elapsed),
		);
		lines.push("");

		// Task preview
		lines.push(this.theme.fg("muted", "Task:"));
		lines.push(d.task.length > 120 ? `${d.task.slice(0, 120)}…` : d.task);
		lines.push("");

		// Tool calls (recent + current)
		const current = getCurrentTool(d);
		if (d.toolCalls.length > 0 || current) {
			lines.push(this.theme.fg("muted", "Tool calls:"));
			for (const call of d.toolCalls.slice(-5)) {
				lines.push(`  ${formatToolCall(call.name, call.args, themeFg)}`);
			}
			if (current) {
				lines.push(
					this.theme.fg("warning", "▸ ") + formatToolCall(current.name, current.args, themeFg),
				);
			}
			lines.push("");
		}

		// Error (if failed)
		if (d.status === "failed" && d.error) {
			lines.push(this.theme.fg("error", `Error: ${d.error}`));
			if (d.stderr) {
				const stderrHead = d.stderr.slice(0, 200);
				lines.push(this.theme.fg("muted", stderrHead));
			}
			lines.push("");
		}

		// Final message — only outside running state
		const finalText = formatFinalOutput(d.messages);
		if (finalText && d.status !== "running") {
			// Markdown component renders internally; we just capture its lines.
			const md = new Markdown(finalText, 0, 0, getMarkdownTheme());
			const mdLines = md.render(Math.max(20, width));
			for (const l of mdLines) lines.push(l);
			lines.push("");
		}

		// Usage
		if (d.usage.turns > 0) {
			lines.push(this.theme.fg("muted", formatUsageStats(d.usage)));
		}

		return lines;
	}

	invalidate(): void {
		// Component interface requires this method. It exists to drop any
		// cached rendering state (we hold none). Repainting is triggered
		// separately via this.tui.requestRender().
	}

	dispose(): void {
		this.pool.off("change", this.handler);
	}
}

function statusIcon(status: SubagentJob["status"]): string {
	switch (status) {
		case "running":
			return "⏳";
		case "completed":
			return "✓";
		case "aborted":
			return "⊘";
		case "failed":
			return "✗";
	}
}
