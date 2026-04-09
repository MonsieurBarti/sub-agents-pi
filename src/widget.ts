import type { ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import type { TUI } from "@mariozechner/pi-tui";
import type { JobPool } from "./job-pool";
import { WIDGET_KEY } from "./types";

export function updateWidget(ctx: ExtensionContext, pool: JobPool): void {
	if (!ctx.hasUI) return;

	const running = pool.countByStatus("running");
	const done = pool.countDone();

	if (running === 0 && done === 0) {
		ctx.ui.setWidget(WIDGET_KEY, undefined);
		return;
	}

	ctx.ui.setWidget(
		WIDGET_KEY,
		(_tui: TUI, theme: Theme) => {
			const parts: string[] = [theme.fg("accent", "🧬 sub-agents")];
			if (running > 0) parts.push(theme.fg("warning", `${running} running`));
			if (done > 0) parts.push(theme.fg("muted", `${done} done`));
			const body = parts.join(theme.fg("muted", " · "));
			const hint = theme.fg("dim", "    [alt+s] open panel");
			return new Text(`${body}${hint}`, 0, 0);
		},
		{ placement: "belowEditor" },
	);
}
