import type { Theme } from "@mariozechner/pi-coding-agent";
import { visibleWidth } from "@mariozechner/pi-tui";
import { type SubagentJob, getCurrentTool } from "./types";

/**
 * Rendering primitives ported from nicobailon/pi-subagents.
 *
 * All primitives here are ANSI-aware via pi-tui's `visibleWidth`. Do NOT use
 * String.prototype.padEnd or .length on strings that may contain escape codes
 * — they'll corrupt terminal alignment.
 */

// -----------------------------------------------------------------------------
// Layout helpers
// -----------------------------------------------------------------------------

/**
 * Pad a string to the given visible width with trailing spaces, correctly
 * ignoring ANSI escape sequences when computing the current width.
 */
export function pad(s: string, len: number): string {
	const vis = visibleWidth(s);
	return s + " ".repeat(Math.max(0, len - vis));
}

/**
 * Render a single row as `│ content │` padded to `width`, where width is the
 * total cell count including the two border characters.
 */
export function row(content: string, width: number, theme: Theme): string {
	const innerW = width - 2;
	return theme.fg("border", "│") + pad(content, innerW) + theme.fg("border", "│");
}

/**
 * Render a rounded-corner top border with centered title text.
 *
 *   ╭───── Title ─────╮
 */
export function renderHeader(text: string, width: number, theme: Theme): string {
	const innerW = Math.max(0, width - 2);
	const padLen = Math.max(0, innerW - visibleWidth(text));
	const padLeft = Math.floor(padLen / 2);
	const padRight = padLen - padLeft;
	return (
		theme.fg("border", `╭${"─".repeat(padLeft)}`) +
		theme.fg("accent", text) +
		theme.fg("border", `${"─".repeat(padRight)}╮`)
	);
}

/**
 * Render a rounded-corner bottom border with centered footer text (dim).
 *
 *   ╰───── esc close ─────╯
 */
export function renderFooter(text: string, width: number, theme: Theme): string {
	const innerW = Math.max(0, width - 2);
	const padLen = Math.max(0, innerW - visibleWidth(text));
	const padLeft = Math.floor(padLen / 2);
	const padRight = padLen - padLeft;
	return (
		theme.fg("border", `╰${"─".repeat(padLeft)}`) +
		theme.fg("dim", text) +
		theme.fg("border", `${"─".repeat(padRight)}╯`)
	);
}

// -----------------------------------------------------------------------------
// ANSI-aware truncation
// -----------------------------------------------------------------------------

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

// Built via RegExp constructor so the literal escape character (0x1B) doesn't
// appear in source as a regex literal, which biome's
// noControlCharactersInRegex rule forbids. The behavior is identical — we
// need to match the ESC byte that starts ANSI SGR sequences.
const ANSI_SGR_RE = new RegExp(`^${String.fromCharCode(0x1b)}\\[[0-9;]*m`);

/**
 * Truncate a line to `maxWidth` cells, appending an ellipsis while preserving
 * any active ANSI styles (colors, bold, background) through the ellipsis.
 *
 * pi-tui's own `truncateToWidth` inserts a `\x1b[0m` reset before the ellipsis,
 * which causes background-color bleed in overlays. This version tracks the
 * stack of active styles and re-applies them so the ellipsis carries the same
 * color/weight as the surrounding text.
 *
 * Grapheme-aware via `Intl.Segmenter` so emoji and combining marks aren't
 * split mid-character.
 */
export function truncLine(text: string, maxWidth: number): string {
	if (visibleWidth(text) <= maxWidth) return text;

	const targetWidth = Math.max(0, maxWidth - 1); // room for single ellipsis
	let result = "";
	let currentWidth = 0;
	let activeStyles: string[] = [];
	let i = 0;

	while (i < text.length) {
		// Match an ANSI escape sequence (only the SGR form we care about).
		const slice = text.slice(i);
		const ansiMatch = slice.match(ANSI_SGR_RE);
		if (ansiMatch) {
			const code = ansiMatch[0];
			result += code;
			if (code === `${String.fromCharCode(0x1b)}[0m` || code === `${String.fromCharCode(0x1b)}[m`) {
				activeStyles = [];
			} else {
				activeStyles.push(code);
			}
			i += code.length;
			continue;
		}

		// Consume the next contiguous non-ANSI text segment.
		let end = i;
		while (end < text.length && !text.slice(end).match(ANSI_SGR_RE)) {
			end++;
		}
		const textPortion = text.slice(i, end);

		for (const seg of segmenter.segment(textPortion)) {
			const grapheme = seg.segment;
			const graphemeWidth = visibleWidth(grapheme);
			if (currentWidth + graphemeWidth > targetWidth) {
				return `${result + activeStyles.join("")}…`;
			}
			result += grapheme;
			currentWidth += graphemeWidth;
		}
		i = end;
	}

	return `${result + activeStyles.join("")}…`;
}

// -----------------------------------------------------------------------------
// Widget hash dedupe
// -----------------------------------------------------------------------------

/**
 * Compute a stable hash over a job list for use by the bottom widget to skip
 * redundant `setWidget` calls. Changes to status, current tool, or token
 * counts all cause the hash to change; per-millisecond clock drift does not.
 */
export function computeWidgetHash(jobs: readonly SubagentJob[]): string {
	return jobs
		.map((job) => {
			const d = job.result;
			const current = getCurrentTool(d);
			const currentToolId = current?.toolCallId ?? current?.name ?? "";
			const turns = d.usage.turns;
			const input = d.usage.input;
			const output = d.usage.output;
			return `${job.id}:${job.status}:${currentToolId}:${turns}:${input}:${output}`;
		})
		.join("|");
}
