import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

import { spawn } from "node:child_process";
import { getPiInvocation, runChildPi } from "../../src/pi-spawn";

const spawnMock = spawn as unknown as ReturnType<typeof vi.fn>;

function makeFakeChild() {
	const stdout = new PassThrough();
	const stderr = new PassThrough();
	const child = new EventEmitter() as EventEmitter & {
		stdout: PassThrough;
		stderr: PassThrough;
		kill: ReturnType<typeof vi.fn>;
		killed: boolean;
	};
	child.stdout = stdout;
	child.stderr = stderr;
	child.kill = vi.fn();
	child.killed = false;
	return child;
}

describe("pi-spawn", () => {
	beforeEach(() => {
		spawnMock.mockReset();
	});

	describe("getPiInvocation", () => {
		const origArgv1 = process.argv[1];
		const origEnv = process.env.PI_BIN;

		afterEach(() => {
			process.argv[1] = origArgv1 as string;
			if (origEnv === undefined) Reflect.deleteProperty(process.env, "PI_BIN");
			else process.env.PI_BIN = origEnv;
		});

		it("uses PI_BIN env override when set", () => {
			process.env.PI_BIN = "/custom/path/to/pi";
			const result = getPiInvocation(["--version"]);
			expect(result.command).toBe("/custom/path/to/pi");
			expect(result.args).toEqual(["--version"]);
		});

		it("relaunches via execPath + argv[1] when argv[1] exists", () => {
			// argv[1] in vitest is a real file path, so this branch hits.
			Reflect.deleteProperty(process.env, "PI_BIN");
			const result = getPiInvocation(["--mode", "json"]);
			expect(result.command).toBe(process.execPath);
			expect(result.args[0]).toBe(process.argv[1]);
			expect(result.args.slice(1)).toEqual(["--mode", "json"]);
		});

		it("falls back to PATH 'pi' when argv[1] missing and runtime is node/bun", () => {
			Reflect.deleteProperty(process.env, "PI_BIN");
			process.argv[1] = "/does/not/exist/nowhere";
			const result = getPiInvocation(["--version"]);
			// When argv[1] doesn't exist and execPath basename is node|bun,
			// we fall back to "pi" on PATH.
			const execName = process.execPath.split("/").pop()?.toLowerCase() ?? "";
			const isGeneric = /^(node|bun)(\.exe)?$/.test(execName);
			if (isGeneric) {
				expect(result.command).toBe("pi");
				expect(result.args).toEqual(["--version"]);
			} else {
				// Compiled pi binary: use execPath directly.
				expect(result.command).toBe(process.execPath);
				expect(result.args).toEqual(["--version"]);
			}
		});
	});

	describe("runChildPi", () => {
		it("parses JSON events across chunk boundaries", async () => {
			const child = makeFakeChild();
			spawnMock.mockReturnValue(child as unknown as ReturnType<typeof spawn>);

			const events: unknown[] = [];
			const runPromise = runChildPi({
				args: ["--mode", "json"],
				cwd: "/tmp",
				onEvent: (evt) => events.push(evt),
			});

			// Simulate stdout arriving in awkward chunks
			child.stdout.write('{"type":"tool_execution_start","toolName":"read"}\n{"type":"tool_');
			child.stdout.write('execution_end"}\n');
			child.stdout.end();
			child.emit("close", 0);

			const result = await runPromise;
			expect(events).toEqual([
				{ type: "tool_execution_start", toolName: "read" },
				{ type: "tool_execution_end" },
			]);
			expect(result.exitCode).toBe(0);
			expect(result.stderr).toBe("");
		});

		it("captures stderr", async () => {
			const child = makeFakeChild();
			spawnMock.mockReturnValue(child as unknown as ReturnType<typeof spawn>);

			const runPromise = runChildPi({
				args: [],
				cwd: "/tmp",
				onEvent: () => {},
			});

			child.stderr.write("Error: something went wrong\n");
			child.stderr.end();
			child.stdout.end();
			child.emit("close", 1);

			const result = await runPromise;
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain("something went wrong");
		});

		it("sends SIGTERM on abort", async () => {
			vi.useFakeTimers();
			const child = makeFakeChild();
			spawnMock.mockReturnValue(child as unknown as ReturnType<typeof spawn>);

			const controller = new AbortController();
			const runPromise = runChildPi({
				args: [],
				cwd: "/tmp",
				signal: controller.signal,
				onEvent: () => {},
			});

			controller.abort();
			expect(child.kill).toHaveBeenCalledWith("SIGTERM");

			vi.advanceTimersByTime(3000);
			expect(child.kill).toHaveBeenCalledWith("SIGKILL");

			child.emit("close", null);
			await runPromise;
			vi.useRealTimers();
		});

		it("clears SIGKILL escalation timer when child exits cleanly after SIGTERM", async () => {
			vi.useFakeTimers();
			const child = makeFakeChild();
			spawnMock.mockReturnValue(child as unknown as ReturnType<typeof spawn>);

			const controller = new AbortController();
			const runPromise = runChildPi({
				args: [],
				cwd: "/tmp",
				signal: controller.signal,
				onEvent: () => {},
			});

			controller.abort();
			expect(child.kill).toHaveBeenCalledWith("SIGTERM");

			// Child closes within 1s; the 3s SIGKILL escalation must be cleared.
			vi.advanceTimersByTime(1000);
			child.emit("close", null);
			await runPromise;

			// Advance past the 3s mark: SIGKILL must NOT fire — timer was cleared.
			vi.advanceTimersByTime(5000);
			expect(child.kill).not.toHaveBeenCalledWith("SIGKILL");
			vi.useRealTimers();
		});

		it("rejects with typed error when spawn fails (ENOENT)", async () => {
			const child = makeFakeChild();
			spawnMock.mockReturnValue(child as unknown as ReturnType<typeof spawn>);

			const runPromise = runChildPi({
				args: [],
				cwd: "/tmp",
				onEvent: () => {},
			});

			const err = Object.assign(new Error("spawn pi ENOENT"), { code: "ENOENT" });
			child.emit("error", err);

			await expect(runPromise).rejects.toThrow(/ENOENT/);
		});

		it("resolves with wasAborted when killed via signal", async () => {
			const child = makeFakeChild();
			spawnMock.mockReturnValue(child as unknown as ReturnType<typeof spawn>);

			const controller = new AbortController();
			const runPromise = runChildPi({
				args: [],
				cwd: "/tmp",
				signal: controller.signal,
				onEvent: () => {},
			});

			controller.abort();
			child.emit("close", null);

			const result = await runPromise;
			expect(result.wasAborted).toBe(true);
		});

		it("flushes remaining buffer on close", async () => {
			const child = makeFakeChild();
			spawnMock.mockReturnValue(child as unknown as ReturnType<typeof spawn>);

			const events: unknown[] = [];
			const runPromise = runChildPi({
				args: [],
				cwd: "/tmp",
				onEvent: (evt) => events.push(evt),
			});

			// Write event without trailing newline
			child.stdout.write('{"type":"test","value":42}');
			child.stdout.end();
			child.emit("close", 0);

			await runPromise;
			expect(events).toEqual([{ type: "test", value: 42 }]);
		});

		it("uses process.execPath when pi command not found", async () => {
			const child = makeFakeChild();
			spawnMock.mockReturnValue(child as unknown as ReturnType<typeof spawn>);

			const runPromise = runChildPi({
				args: ["--version"],
				cwd: "/tmp",
				onEvent: () => {},
			});

			child.stdout.end();
			child.stderr.end();
			child.emit("close", 0);

			await runPromise;

			// Should have called spawn with process.execPath or "pi"
			expect(spawnMock).toHaveBeenCalled();
			const [command] = spawnMock.mock.calls[0] as string[];
			expect([process.execPath, "pi"]).toContain(command);
		});
	});
});
