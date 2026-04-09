import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { THINKING_LEVELS } from "./types";

const TASK_ARG_LIMIT = 8000;

export function applyThinkingSuffix(
	model: string | undefined,
	thinking: string | undefined,
): string | undefined {
	if (!model || !thinking || thinking === "off") return model;
	const colonIdx = model.lastIndexOf(":");
	if (
		colonIdx !== -1 &&
		THINKING_LEVELS.includes(model.substring(colonIdx + 1) as (typeof THINKING_LEVELS)[number])
	) {
		return model;
	}
	return `${model}:${thinking}`;
}

export interface BuildPiArgsInput {
	task: string;
	systemPrompt: string;
	model?: string;
	thinking?: string;
	tools?: string[];
}

export interface BuildPiArgsResult {
	args: string[];
	tempDir: string | null;
}

export function buildPiArgs(input: BuildPiArgsInput): BuildPiArgsResult {
	const args: string[] = ["--mode", "json", "-p", "--no-session"];
	let tempDir: string | null = null;

	try {
		const modelArg = applyThinkingSuffix(input.model, input.thinking);
		if (modelArg) {
			args.push("--models", modelArg);
		}

		if (input.tools && input.tools.length > 0) {
			args.push("--tools", input.tools.join(","));
		}

		if (input.systemPrompt.trim()) {
			tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-"));
			const promptPath = path.join(tempDir, "prompt.md");
			fs.writeFileSync(promptPath, input.systemPrompt, { mode: 0o600 });
			args.push("--append-system-prompt", promptPath);
		}

		if (input.task.length > TASK_ARG_LIMIT) {
			if (!tempDir) {
				tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-"));
			}
			const taskPath = path.join(tempDir, "task.md");
			fs.writeFileSync(taskPath, `Task: ${input.task}`, { mode: 0o600 });
			args.push(`@${taskPath}`);
		} else {
			args.push(`Task: ${input.task}`);
		}

		return { args, tempDir };
	} catch (err) {
		// If any fs op fails mid-build, clean up any temp dir we already created
		// so we don't leak on disk.
		cleanupTempDir(tempDir);
		throw err;
	}
}

export function cleanupTempDir(tempDir: string | null | undefined): void {
	if (!tempDir) return;
	try {
		fs.rmSync(tempDir, { recursive: true, force: true });
	} catch {
		// Best effort
	}
}
