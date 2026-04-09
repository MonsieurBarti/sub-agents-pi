import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

import { spawn } from "node:child_process";
import { runChildPi } from "../../src/pi-spawn";

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
