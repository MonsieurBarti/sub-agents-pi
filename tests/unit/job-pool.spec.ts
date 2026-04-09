import { beforeEach, describe, expect, it, vi } from "vitest";
import { JobPool } from "../../src/job-pool";
import type { SubagentDetails, SubagentJob } from "../../src/types";

function makeJob(overrides: Partial<SubagentJob> = {}): SubagentJob {
	return {
		id: "test-1",
		label: "test",
		model: "claude-sonnet-4",
		status: "running",
		startedAt: Date.now(),
		result: {} as SubagentDetails,
		abort: vi.fn(),
		...overrides,
	};
}

describe("JobPool", () => {
	let pool: JobPool;

	beforeEach(() => {
		pool = new JobPool();
	});

	describe("add", () => {
		it("adds a job to the pool", () => {
			const job = makeJob();
			pool.add(job);
			expect(pool.get(job.id)).toBe(job);
		});

		it("emits change event", () => {
			const handler = vi.fn();
			pool.on("change", handler);
			pool.add(makeJob());
			expect(handler).toHaveBeenCalled();
		});

		it("throws when a job with the same id is added twice", () => {
			const job = makeJob({ id: "dup" });
			pool.add(job);
			expect(() => pool.add(makeJob({ id: "dup" }))).toThrow(/duplicate/i);
			// Original job must be preserved unchanged.
			expect(pool.get("dup")).toBe(job);
		});
	});

	describe("update", () => {
		it("patches job properties", () => {
			const job = makeJob();
			pool.add(job);
			pool.update(job.id, { status: "completed", endedAt: Date.now() });
			expect(pool.get(job.id)?.status).toBe("completed");
		});

		it("emits change event", () => {
			const job = makeJob();
			pool.add(job);
			const handler = vi.fn();
			pool.on("change", handler);
			pool.update(job.id, { status: "failed" });
			expect(handler).toHaveBeenCalled();
		});

		it("silently ignores unknown id", () => {
			const handler = vi.fn();
			pool.on("change", handler);
			pool.update("nonexistent", { status: "completed" });
			expect(handler).not.toHaveBeenCalled();
		});
	});

	describe("remove", () => {
		it("removes a job from the pool", () => {
			const job = makeJob();
			pool.add(job);
			pool.remove(job.id);
			expect(pool.get(job.id)).toBeUndefined();
		});

		it("emits change event", () => {
			const job = makeJob();
			pool.add(job);
			const handler = vi.fn();
			pool.on("change", handler);
			pool.remove(job.id);
			expect(handler).toHaveBeenCalled();
		});
	});

	describe("kill", () => {
		it("calls abort on running job", () => {
			const abort = vi.fn();
			const job = makeJob({ abort });
			pool.add(job);
			pool.kill(job.id);
			expect(abort).toHaveBeenCalled();
		});

		it("does not call abort on non-running job", () => {
			const abort = vi.fn();
			const job = makeJob({ status: "completed", abort });
			pool.add(job);
			pool.kill(job.id);
			expect(abort).not.toHaveBeenCalled();
		});
	});

	describe("list", () => {
		it("returns jobs sorted by status then startedAt", () => {
			const job1 = makeJob({ id: "1", status: "completed", startedAt: 1000 });
			const job2 = makeJob({ id: "2", status: "running", startedAt: 2000 });
			const job3 = makeJob({ id: "3", status: "running", startedAt: 3000 });
			const job4 = makeJob({ id: "4", status: "failed", startedAt: 4000 });

			pool.add(job1);
			pool.add(job2);
			pool.add(job3);
			pool.add(job4);

			const list = pool.list();
			// Running first (by startedAt desc), then others
			expect(list[0]?.id).toBe("3");
			expect(list[1]?.id).toBe("2");
		});

		it("returns empty array when pool is empty", () => {
			expect(pool.list()).toEqual([]);
		});
	});

	describe("countByStatus", () => {
		it("counts jobs by status", () => {
			pool.add(makeJob({ id: "1", status: "running" }));
			pool.add(makeJob({ id: "2", status: "running" }));
			pool.add(makeJob({ id: "3", status: "completed" }));

			expect(pool.countByStatus("running")).toBe(2);
			expect(pool.countByStatus("completed")).toBe(1);
			expect(pool.countByStatus("failed")).toBe(0);
		});
	});

	describe("countDone", () => {
		it("counts completed + failed + aborted", () => {
			pool.add(makeJob({ id: "1", status: "running" }));
			pool.add(makeJob({ id: "2", status: "completed" }));
			pool.add(makeJob({ id: "3", status: "failed" }));
			pool.add(makeJob({ id: "4", status: "aborted" }));

			expect(pool.countDone()).toBe(3);
		});
	});

	describe("clear", () => {
		it("removes all jobs", () => {
			pool.add(makeJob({ id: "1" }));
			pool.add(makeJob({ id: "2" }));
			pool.clear();
			expect(pool.list()).toEqual([]);
		});

		it("emits change event", () => {
			pool.add(makeJob());
			const handler = vi.fn();
			pool.on("change", handler);
			pool.clear();
			expect(handler).toHaveBeenCalled();
		});
	});

	describe("pruneDone", () => {
		it("removes done jobs older than threshold", () => {
			const realNow = Date.now;
			const mockedTime = 1000000;
			Date.now = () => mockedTime;

			try {
				pool.add(makeJob({ id: "old", status: "completed", endedAt: mockedTime - 60000 }));
				pool.add(makeJob({ id: "new", status: "completed", endedAt: mockedTime - 10000 }));
				pool.add(makeJob({ id: "running", status: "running" }));

				const removed = pool.pruneDone(30000);
				expect(removed).toBe(1);
				expect(pool.get("old")).toBeUndefined();
				expect(pool.get("new")).toBeDefined();
				expect(pool.get("running")).toBeDefined();
			} finally {
				Date.now = realNow;
			}
		});
	});
});
