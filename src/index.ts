import { defineTool } from "@mariozechner/pi-coding-agent";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { createExecutor } from "./executor";
import { JobPool } from "./job-pool";
import { SubagentPanel } from "./panel";
import { renderSubagentCall, renderSubagentResult } from "./render";
import { SubagentParams, WIDGET_KEY } from "./types";
import type { SubagentDetails } from "./types";
import { updateWidget } from "./widget";

export default function registerSubagentExtension(pi: ExtensionAPI): void {
	const pool = new JobPool();
	const executor = createExecutor({ pool });

	interface ExtensionState {
		lastUiContext: ExtensionContext | null;
		pruneTimer: ReturnType<typeof setInterval> | null;
	}

	const state: ExtensionState = {
		lastUiContext: null,
		pruneTimer: null,
	};

	// -----------------------------------------------------------------
	// Tool registration
	// -----------------------------------------------------------------

	const tool = defineTool<typeof SubagentParams, SubagentDetails>({
		name: "subagent",
		label: "Subagent",
		description:
			"Delegate a task to an isolated sub-agent running in its own pi process. " +
			"Define the identity (system_prompt), model, and thinking level per call. " +
			"The sub-agent runs in a separate context window — only the final output comes back.",
		promptSnippet: "Delegate to an isolated sub-agent",
		promptGuidelines: [
			"Use for focused, self-contained tasks: codebase recon, targeted refactors, review passes.",
			"Write a crisp system_prompt — it defines the sub-agent's identity.",
			"Pick the cheapest model that can do the job.",
			"Set 'tools' to an allowlist for read-only sub-agents.",
		],
		parameters: SubagentParams,

		async execute(id, params, signal, onUpdate, ctx) {
			state.lastUiContext = ctx;
			return executor.execute(id, params, signal, onUpdate, ctx);
		},

		renderCall(args, theme) {
			return renderSubagentCall(args, theme);
		},

		renderResult(result, options, theme) {
			return renderSubagentResult(result, options, theme);
		},
	});

	pi.registerTool(tool);

	// -----------------------------------------------------------------
	// Panel shortcut
	// -----------------------------------------------------------------

	pi.registerShortcut("alt+s", {
		description: "Open the sub-agents panel",
		handler: async (ctx) => {
			await ctx.ui.custom<void>(
				(tui, theme, _kb, done) => new SubagentPanel(pool, tui, theme, done),
				{
					overlay: true,
					overlayOptions: { anchor: "center", width: "80%", maxHeight: "75%" },
				},
			);
		},
	});

	// -----------------------------------------------------------------
	// Pool change subscription for widget updates
	// -----------------------------------------------------------------

	pool.on("change", () => {
		if (state.lastUiContext) {
			updateWidget(state.lastUiContext, pool);
		}
	});

	// -----------------------------------------------------------------
	// Session lifecycle
	// -----------------------------------------------------------------

	pi.on("session_start", (_event, ctx) => {
		state.lastUiContext = ctx;
		pool.clear();
		updateWidget(ctx, pool);

		// Prune done jobs every 10s
		state.pruneTimer = setInterval(() => {
			pool.pruneDone(30000);
		}, 10000);

		if (ctx.hasUI) {
			ctx.ui.notify("Sub-agents ready (alt+s to open panel)", "info");
		}
	});

	pi.on("session_shutdown", () => {
		// Abort any running jobs
		for (const job of pool.list()) {
			if (job.status === "running") job.abort();
		}

		// Clear widget
		if (state.lastUiContext?.hasUI) {
			state.lastUiContext.ui.setWidget(WIDGET_KEY, undefined);
		}

		// Clear prune timer
		if (state.pruneTimer) {
			clearInterval(state.pruneTimer);
			state.pruneTimer = null;
		}

		pool.removeAllListeners();
	});
}
