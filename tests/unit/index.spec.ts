import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import registerExtension from "../../src/index";

function makeMockPi(): ExtensionAPI {
	return {
		registerTool: vi.fn(),
		registerShortcut: vi.fn(),
		on: vi.fn(),
		events: { on: vi.fn() },
	} as unknown as ExtensionAPI;
}

describe("extension registration", () => {
	// Depth-related env var leaks between tests; snapshot and restore around
	// every test so "we're a sub-agent" state doesn't bleed across cases.
	const origDepth = process.env.PI_SUBAGENT_DEPTH;

	beforeEach(() => {
		Reflect.deleteProperty(process.env, "PI_SUBAGENT_DEPTH");
	});

	afterEach(() => {
		if (origDepth === undefined) Reflect.deleteProperty(process.env, "PI_SUBAGENT_DEPTH");
		else process.env.PI_SUBAGENT_DEPTH = origDepth;
	});

	it("registers without throwing", () => {
		const pi = makeMockPi();
		expect(() => registerExtension(pi)).not.toThrow();
	});

	it("registers the tff-subagent tool at the top level", () => {
		const pi = makeMockPi();
		registerExtension(pi);
		expect(pi.registerTool).toHaveBeenCalledWith(expect.objectContaining({ name: "tff-subagent" }));
	});

	it("registers the panel shortcut as ctrl+shift+s at the top level", () => {
		// ctrl+shift+s avoids the macOS Option-S → ß compose quirk that
		// swallows alt+s in most terminal defaults.
		const pi = makeMockPi();
		registerExtension(pi);
		expect(pi.registerShortcut).toHaveBeenCalledWith("ctrl+shift+s", expect.any(Object));
	});

	it("registers session lifecycle hooks", () => {
		const pi = makeMockPi();
		registerExtension(pi);
		expect(pi.on).toHaveBeenCalledWith("session_start", expect.any(Function));
		expect(pi.on).toHaveBeenCalledWith("session_shutdown", expect.any(Function));
	});

	it("does NOT register the subagent tool when running inside a sub-agent", () => {
		// When pi spawns a child with PI_SUBAGENT_DEPTH=1, the child pi loads
		// this same extension. We must hide the tool from that child so its
		// LLM can't recursively delegate.
		process.env.PI_SUBAGENT_DEPTH = "1";
		const pi = makeMockPi();
		registerExtension(pi);
		expect(pi.registerTool).not.toHaveBeenCalled();
	});

	it("does NOT register the panel shortcut when running inside a sub-agent", () => {
		process.env.PI_SUBAGENT_DEPTH = "1";
		const pi = makeMockPi();
		registerExtension(pi);
		expect(pi.registerShortcut).not.toHaveBeenCalled();
	});

	it("still handles PI_SUBAGENT_DEPTH=0 as top-level", () => {
		process.env.PI_SUBAGENT_DEPTH = "0";
		const pi = makeMockPi();
		registerExtension(pi);
		expect(pi.registerTool).toHaveBeenCalled();
	});

	describe("getSharedState()", () => {
		beforeEach(() => {
			vi.resetModules();
		});

		it("throws before registerSubagentExtension() is called", async () => {
			const mod = await import("../../src/index");
			expect(() => mod.getSharedState()).toThrow(
				"spawn() called before registerSubagentExtension()",
			);
		});

		it("returns pool and executor after registration", async () => {
			const mod = await import("../../src/index");
			const pi = makeMockPi();
			mod.default(pi);
			const state = mod.getSharedState();
			expect(state.pool).toBeDefined();
			expect(state.executor).toBeDefined();
		});
	});
});
