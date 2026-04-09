import type { ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import type { TUI } from "@mariozechner/pi-tui";
import type { JobPool } from "./job-pool";
import { computeWidgetHash } from "./render-helpers";
import { WIDGET_KEY } from "./types";

// Cached hash across calls so we skip setWidget when nothing relevant changed
// (e.g. a pool change event that didn't alter counts or current tool).
// Per-widget-key state — one instance per ctx is all we need because there's
// only one widget instance per pi session.
let lastHash = "";

export function updateWidget(ctx: ExtensionContext, pool: JobPool): void {
	if (!ctx.hasUI) return;

	const running = pool.countByStatus("running");
	const done = pool.countDone();

	if (running === 0 && done === 0) {
		ctx.ui.setWidget(WIDGET_KEY, undefined);
		lastHash = "";
		return;
	}

	const hash = `${running}:${done}:${computeWidgetHash(pool.list())}`;
	if (hash === lastHash) {
		return; // no-op, nothing user-visible changed
	}
	lastHash = hash;

	ctx.ui.setWidget(
		WIDGET_KEY,
		(_tui: TUI, theme: Theme) => {
			const parts: string[] = [theme.fg("accent", "🧬 sub-agents")];
			if (running > 0) parts.push(theme.fg("warning", `${running} running`));
			if (done > 0) parts.push(theme.fg("muted", `${done} done`));
			const body = parts.join(theme.fg("muted", " · "));
			const hint = theme.fg("dim", "    [ctrl+shift+s] open panel");
			return new Text(`${body}${hint}`, 0, 0);
		},
		{ placement: "belowEditor" },
	);
}

/**
 * Reset the widget dedupe cache. Call on session shutdown so stale state
 * doesn't carry over to the next session.
 */
export function resetWidgetCache(): void {
	lastHash = "";
}
