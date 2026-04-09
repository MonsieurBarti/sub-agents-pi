import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

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

export interface PiInvocation {
	command: string;
	args: string[];
}

/**
 * Resolve how to invoke pi for spawning a child process.
 *
 * Resolution order:
 *   1. PI_BIN env var — explicit override, used verbatim.
 *   2. process.argv[1] exists on disk — our own parent pi was launched
 *      via `node/bun path/to/pi-cli.js`, so relaunch the same script
 *      through the current runtime.
 *   3. process.execPath is NOT node/bun — we're inside a compiled pi
 *      binary (bun-compiled, esbuild single-file, etc.), so invoke it
 *      directly.
 *   4. Fallback — resolve "pi" via PATH.
 *
 * Mirrors the canonical pattern used by pi's own bundled subagent example.
 */
export function getPiInvocation(args: string[]): PiInvocation {
	const envOverride = process.env.PI_BIN;
	if (envOverride) {
		return { command: envOverride, args };
	}

	const currentScript = process.argv[1];
	if (currentScript && fs.existsSync(currentScript)) {
		return { command: process.execPath, args: [currentScript, ...args] };
	}

	const execName = path.basename(process.execPath).toLowerCase();
	const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
	if (!isGenericRuntime) {
		return { command: process.execPath, args };
	}

	return { command: "pi", args };
}

export async function runChildPi(options: RunChildPiOptions): Promise<RunChildPiResult> {
	const { args, cwd, signal, onEvent, commandOverride } = options;
	const invocation = commandOverride
		? { command: commandOverride.command, args: [...commandOverride.baseArgs, ...args] }
		: getPiInvocation(args);

	return new Promise((resolve, reject) => {
		const proc = spawn(invocation.command, invocation.args, {
			cwd,
			stdio: ["ignore", "pipe", "pipe"],
		});

		let buffer = "";
		let stderr = "";
		let wasAborted = false;
		let killTimer: ReturnType<typeof setTimeout> | null = null;
		let settled = false;

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
				killTimer = setTimeout(() => {
					killTimer = null;
					if (!proc.killed) proc.kill("SIGKILL");
				}, 3000);
			}
		};

		if (signal) {
			if (signal.aborted) handleAbort();
			else signal.addEventListener("abort", handleAbort, { once: true });
		}

		proc.on("close", (exitCode) => {
			if (settled) return;
			settled = true;
			if (killTimer) {
				clearTimeout(killTimer);
				killTimer = null;
			}
			// Flush remaining buffer
			if (buffer.trim()) processLine(buffer);
			resolve({ exitCode, stderr, wasAborted });
		});

		proc.on("error", (err) => {
			if (settled) return;
			settled = true;
			if (killTimer) {
				clearTimeout(killTimer);
				killTimer = null;
			}
			reject(err);
		});
	});
}
