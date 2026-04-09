import { spawn } from "node:child_process";
import * as fs from "node:fs";

export interface RunChildPiOptions {
	args: string[];
	cwd: string;
	signal?: AbortSignal;
	onEvent: (event: unknown) => void;
	commandOverride?: { command: string; baseArgs: string[] };
}

export interface RunChildPiResult {
	exitCode: number | null;
	stderr: string;
	wasAborted: boolean;
}

/**
 * Resolve the pi command to use.
 * - If process.argv[1] is a runnable node script, use node + that script
 * - Otherwise, use "pi" from PATH
 */
function getPiCommand(): { command: string; baseArgs: string[] } {
	const currentScript = process.argv[1];
	if (currentScript && fs.existsSync(currentScript)) {
		// Check if it's a runnable script (.js, .mjs, .cjs)
		if (/\.(?:mjs|cjs|js)$/i.test(currentScript)) {
			return { command: process.execPath, baseArgs: [currentScript] };
		}
	}
	return { command: "pi", baseArgs: [] };
}

export async function runChildPi(options: RunChildPiOptions): Promise<RunChildPiResult> {
	const { args, cwd, signal, onEvent, commandOverride } = options;
	const { command, baseArgs } = commandOverride ?? getPiCommand();

	return new Promise((resolve) => {
		const proc = spawn(command, [...baseArgs, ...args], {
			cwd,
			stdio: ["ignore", "pipe", "pipe"],
		});

		let buffer = "";
		let stderr = "";
		let wasAborted = false;

		const processLine = (line: string) => {
			if (!line.trim()) return;
			try {
				const event = JSON.parse(line);
				onEvent(event);
			} catch {
				// Non-JSON lines are expected; ignore
			}
		};

		proc.stdout.on("data", (data: Buffer) => {
			buffer += data.toString();
			const lines = buffer.split("\n");
			buffer = lines.pop() || "";
			for (const line of lines) processLine(line);
		});

		proc.stderr.on("data", (data: Buffer) => {
			stderr += data.toString();
		});

		const handleAbort = () => {
			if (signal?.aborted && !proc.killed) {
				wasAborted = true;
				proc.kill("SIGTERM");
				setTimeout(() => {
					if (!proc.killed) proc.kill("SIGKILL");
				}, 3000);
			}
		};

		if (signal) {
			if (signal.aborted) handleAbort();
			else signal.addEventListener("abort", handleAbort, { once: true });
		}

		proc.on("close", (exitCode) => {
			// Flush remaining buffer
			if (buffer.trim()) processLine(buffer);
			resolve({ exitCode, stderr, wasAborted });
		});

		proc.on("error", () => {
			resolve({ exitCode: 1, stderr, wasAborted });
		});
	});
}
