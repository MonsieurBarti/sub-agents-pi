import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { formatFinalOutput } from "./formatters";
import { getSharedState } from "./index";
import type { SubagentParamsT } from "./types";

export interface SpawnResult {
	success: boolean;
	output: string;
}

let spawnCounter = 0;

export async function spawn(_pi: unknown, params: SubagentParamsT): Promise<SpawnResult> {
	const { executor } = getSharedState();

	const id = `spawn-${Date.now()}-${++spawnCounter}`;
	const cwd = params.cwd ?? process.cwd();
	const ctx = { cwd } as ExtensionContext;

	const result = await executor.execute(id, { ...params, cwd }, undefined, undefined, ctx);

	return {
		success: result.details.status === "completed",
		output: formatFinalOutput(result.details.messages) || result.details.error || "",
	};
}
