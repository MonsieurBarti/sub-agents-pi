import * as fs from "node:fs";
import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { Message } from "@mariozechner/pi-ai";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { JobPool } from "./job-pool";
import { buildPiArgs, cleanupTempDir } from "./pi-args";
import { applyThinkingSuffix } from "./pi-args";
import { runChildPi } from "./pi-spawn";
import type { SubagentDetails, SubagentJob, SubagentParamsT, ToolCallRecord } from "./types";

export interface CreateExecutorOptions {
	pool: JobPool;
	piCommandOverride?: { command: string; baseArgs: string[] };
}

export function createExecutor(options: CreateExecutorOptions) {
	const { pool, piCommandOverride } = options;

	return {
		async execute(
			id: string,
			params: SubagentParamsT,
			signal: AbortSignal | undefined,
			onUpdate: ((result: AgentToolResult<SubagentDetails>) => void) | undefined,
			ctx: ExtensionContext,
		): Promise<AgentToolResult<SubagentDetails>> {
			const controller = new AbortController();
			const { signal: combinedSignal, dispose: disposeSignal } = combineSignals(
				signal,
				controller.signal,
			);

			const details: SubagentDetails = {
				id,
				label: params.label ?? "subagent",
				model: applyThinkingSuffix(params.model, params.thinking) ?? null,
				status: "running",
				startedAt: Date.now(),
				task: params.task,
				systemPrompt: params.system_prompt,
				toolCalls: [],
				currentTool: null,
				usage: {
					input: 0,
					output: 0,
					cacheRead: 0,
					cacheWrite: 0,
					cost: 0,
					turns: 0,
					contextTokens: 0,
				},
				messages: [],
				cwd: params.cwd ?? ctx.cwd,
			};

			const job: SubagentJob = {
				id,
				label: details.label,
				model: details.model,
				status: "running",
				startedAt: details.startedAt,
				result: details,
				abort: () => controller.abort(),
			};

			pool.add(job);

			// Validate cwd before we try to spawn — gives a clear error path
			// instead of a mystery "exited with code 1".
			if (!fs.existsSync(details.cwd)) {
				details.status = "failed";
				details.endedAt = Date.now();
				details.error = `cwd does not exist: ${details.cwd}`;
				pool.update(id, { status: "failed", endedAt: details.endedAt });
				disposeSignal();
				return {
					content: [{ type: "text", text: details.error }],
					details,
				};
			}

			let tempDir: string | null = null;
			try {
				const built = buildPiArgs({
					task: params.task,
					systemPrompt: params.system_prompt,
					model: params.model,
					thinking: params.thinking,
					tools: params.tools,
				});
				tempDir = built.tempDir;

				// Throttle updates
				let lastUpdate = 0;
				const throttleMs = 50;
				const fireUpdate = () => {
					const now = Date.now();
					if (now - lastUpdate >= throttleMs) {
						lastUpdate = now;
						onUpdate?.({
							content: [{ type: "text", text: getFinalOutput(details.messages) || "(running...)" }],
							details,
						});
					}
				};

				const result = await runChildPi({
					args: built.args,
					cwd: details.cwd,
					signal: combinedSignal,
					onEvent: (evt) => handleEvent(evt as Record<string, unknown>, details, fireUpdate),
					commandOverride: piCommandOverride,
				});

				details.status = result.wasAborted
					? "aborted"
					: result.exitCode === 0
						? "completed"
						: "failed";
				details.endedAt = Date.now();

				if (result.exitCode !== 0 && !result.wasAborted && !details.error) {
					details.error = result.stderr.trim() || `Child pi exited with code ${result.exitCode}`;
				}

				const finalText = getFinalOutput(details.messages) || details.error || "(no output)";

				pool.update(id, { status: details.status, endedAt: details.endedAt });

				return {
					content: [{ type: "text", text: finalText }],
					details,
				};
			} catch (err) {
				// Convert any error (spawn ENOENT, buildPiArgs fs throw, etc.) into a
				// structured failure so the LLM sees it as a tool result, not an
				// unhandled rejection.
				details.status = "failed";
				details.endedAt = Date.now();
				details.error = err instanceof Error ? err.message : String(err);
				pool.update(id, { status: "failed", endedAt: details.endedAt });
				return {
					content: [{ type: "text", text: details.error }],
					details,
				};
			} finally {
				cleanupTempDir(tempDir);
				disposeSignal();
			}
		},
	};
}

function handleEvent(
	evt: Record<string, unknown>,
	details: SubagentDetails,
	fireUpdate: () => void,
): void {
	if (evt.type === "tool_execution_start" && typeof evt.toolName === "string") {
		const record: ToolCallRecord = {
			name: evt.toolName,
			toolCallId: typeof evt.toolCallId === "string" ? evt.toolCallId : undefined,
			args: (evt.args as Record<string, unknown>) ?? {},
			startedAt: Date.now(),
		};
		details.currentTool = record;
		fireUpdate();
		return;
	}

	if (evt.type === "tool_execution_end") {
		// Capture result + isError from the end event (real pi AgentEvent shape).
		// Match by toolCallId when present; otherwise fall back to the last
		// in-flight record (single-tool-at-a-time path).
		const evtCallId = typeof evt.toolCallId === "string" ? evt.toolCallId : undefined;
		let record = details.currentTool;
		if (evtCallId && record?.toolCallId !== evtCallId) {
			// Out-of-order end for a different call — ignore currentTool and create
			// a synthetic record so we still capture the result.
			record = {
				name: typeof evt.toolName === "string" ? evt.toolName : "unknown",
				toolCallId: evtCallId,
				args: {},
				startedAt: Date.now(),
			};
		}
		if (record) {
			record.endedAt = Date.now();
			if ("result" in evt) record.result = evt.result;
			if (typeof evt.isError === "boolean") record.isError = evt.isError;
			details.toolCalls.push(record);
		}
		details.currentTool = null;
		fireUpdate();
		return;
	}

	if (evt.type === "message_end" && evt.message) {
		const msg = evt.message as Message;
		details.messages.push(msg);

		if (msg.role === "assistant") {
			details.usage.turns++;
			const u = msg.usage as
				| {
						input?: number;
						inputTokens?: number;
						output?: number;
						outputTokens?: number;
						cacheRead?: number;
						cacheWrite?: number;
						cost?: { total: number };
						totalTokens?: number;
				  }
				| undefined;
			if (u) {
				details.usage.input += u.input || u.inputTokens || 0;
				details.usage.output += u.output || u.outputTokens || 0;
				details.usage.cacheRead += u.cacheRead || 0;
				details.usage.cacheWrite += u.cacheWrite || 0;
				details.usage.cost += u.cost?.total || 0;
				details.usage.contextTokens = u.totalTokens || 0;
			}
			if (!details.model && "model" in msg && typeof msg.model === "string")
				details.model = msg.model;
			if ("errorMessage" in msg && typeof msg.errorMessage === "string")
				details.error = msg.errorMessage;
		}
		fireUpdate();
	}
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

/**
 * Combine two AbortSignals into one. Returns the combined signal plus a
 * `dispose` function that removes any listeners we installed on the caller's
 * signal. Always call `dispose()` in a `finally` block to prevent listener
 * accumulation on long-lived parent signals (e.g. session-scoped abort).
 */
function combineSignals(
	a: AbortSignal | undefined,
	b: AbortSignal,
): { signal: AbortSignal; dispose: () => void } {
	if (!a) return { signal: b, dispose: () => {} };

	const controller = new AbortController();
	if (a.aborted || b.aborted) controller.abort();

	const onAAbort = () => controller.abort();
	const onBAbort = () => controller.abort();
	a.addEventListener("abort", onAAbort, { once: true });
	b.addEventListener("abort", onBAbort, { once: true });

	return {
		signal: controller.signal,
		dispose: () => {
			a.removeEventListener("abort", onAAbort);
			b.removeEventListener("abort", onBAbort);
		},
	};
}
