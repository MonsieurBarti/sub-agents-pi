import { describe, expect, it, vi } from "vitest";
import registerExtension from "../../src/index";

function makeMockPi() {
	return {
		registerTool: vi.fn(),
		registerShortcut: vi.fn(),
		on: vi.fn(),
		events: { on: vi.fn() },
	} as unknown;
}

describe("extension registration", () => {
	it("registers without throwing", () => {
		const pi = makeMockPi();
		expect(() => registerExtension(pi)).not.toThrow();
	});

	it("registers the subagent tool", () => {
		const pi = makeMockPi();
		registerExtension(pi);
		expect((pi as { registerTool: ReturnType<typeof vi.fn> }).registerTool).toHaveBeenCalledWith(
			expect.objectContaining({ name: "subagent" }),
		);
	});

	it("registers the panel shortcut", () => {
		const pi = makeMockPi();
		registerExtension(pi);
		expect(
			(pi as { registerShortcut: ReturnType<typeof vi.fn> }).registerShortcut,
		).toHaveBeenCalled();
	});

	it("registers session lifecycle hooks", () => {
		const pi = makeMockPi();
		registerExtension(pi);
		expect((pi as { on: ReturnType<typeof vi.fn> }).on).toHaveBeenCalledWith(
			"session_start",
			expect.any(Function),
		);
		expect((pi as { on: ReturnType<typeof vi.fn> }).on).toHaveBeenCalledWith(
			"session_shutdown",
			expect.any(Function),
		);
	});
});
