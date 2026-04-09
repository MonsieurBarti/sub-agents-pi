import * as fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { applyThinkingSuffix } from "../../src/formatters";
import { buildPiArgs, cleanupTempDir } from "../../src/pi-args";

vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	return {
		...actual,
		mkdtempSync: vi.fn(() => "/tmp/pi-subagent-test"),
		writeFileSync: vi.fn(),
		rmSync: vi.fn(),
	};
});

describe("pi-args", () => {
	describe("applyThinkingSuffix", () => {
		it("returns model unchanged when thinking is off or undefined", () => {
			expect(applyThinkingSuffix("claude-sonnet-4", undefined)).toBe("claude-sonnet-4");
			expect(applyThinkingSuffix("claude-sonnet-4", "off")).toBe("claude-sonnet-4");
		});

		it("appends thinking level as suffix", () => {
			expect(applyThinkingSuffix("claude-sonnet-4", "high")).toBe("claude-sonnet-4:high");
			expect(applyThinkingSuffix("claude-haiku-4-5", "low")).toBe("claude-haiku-4-5:low");
		});

		it("does not double-append if model already has thinking suffix", () => {
			expect(applyThinkingSuffix("claude-sonnet-4:medium", "high")).toBe("claude-sonnet-4:medium");
		});

		it("returns undefined when model is undefined", () => {
			expect(applyThinkingSuffix(undefined, "high")).toBeUndefined();
		});
	});

	describe("buildPiArgs", () => {
		it("builds minimal args for basic call", () => {
			const result = buildPiArgs({
				task: "Do something",
				systemPrompt: "You are helpful.",
			});

			expect(result.args).toContain("--mode");
			expect(result.args).toContain("json");
			expect(result.args).toContain("-p");
			expect(result.args).toContain("--no-session");
			expect(result.args).toContain("Task: Do something");
			expect(result.tempDir).toBeDefined();
		});

		it("includes model with thinking suffix", () => {
			const result = buildPiArgs({
				task: "t",
				systemPrompt: "sp",
				model: "claude-sonnet-4",
				thinking: "high",
			});

			expect(result.args).toContain("--models");
			expect(result.args).toContain("claude-sonnet-4:high");
		});

		it("includes tools allowlist", () => {
			const result = buildPiArgs({
				task: "t",
				systemPrompt: "sp",
				tools: ["read", "grep", "bash"],
			});

			expect(result.args).toContain("--tools");
			expect(result.args).toContain("read,grep,bash");
		});

		it("creates temp dir and writes system prompt", () => {
			const result = buildPiArgs({
				task: "t",
				systemPrompt: "You are a scout.",
			});

			expect(result.tempDir).toBeDefined();
			expect(result.args).toContain("--append-system-prompt");
		});

		it("handles long tasks by writing to file", () => {
			const longTask = "x".repeat(10000);
			const result = buildPiArgs({
				task: longTask,
				systemPrompt: "sp",
			});

			const taskRef = result.args.find((a) => typeof a === "string" && a.startsWith("@"));
			expect(taskRef).toBeDefined();
		});

		it("cleans up temp dir when writeFileSync throws", () => {
			const writeMock = vi.mocked(fs.writeFileSync);
			const rmMock = vi.mocked(fs.rmSync);
			writeMock.mockImplementationOnce(() => {
				throw new Error("EACCES");
			});

			expect(() =>
				buildPiArgs({
					task: "t",
					systemPrompt: "You are a scout.",
				}),
			).toThrow(/EACCES/);

			// The tempDir that mkdtempSync returned must be cleaned up on failure.
			expect(rmMock).toHaveBeenCalledWith(
				expect.stringContaining("pi-subagent-test"),
				expect.objectContaining({ recursive: true, force: true }),
			);
		});
	});

	describe("cleanupTempDir", () => {
		it("removes temp directory", () => {
			const tempDir = "/tmp/test-dir";
			cleanupTempDir(tempDir);
			expect(fs.rmSync).toHaveBeenCalledWith(tempDir, { recursive: true, force: true });
		});

		it("handles null/undefined gracefully", () => {
			expect(() => cleanupTempDir(null)).not.toThrow();
			expect(() => cleanupTempDir(undefined)).not.toThrow();
		});
	});
});
