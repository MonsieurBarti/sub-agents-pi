import { EventEmitter } from "node:events";
import type { SubagentJob } from "./types";

export class JobPool extends EventEmitter {
	private jobs = new Map<string, SubagentJob>();

	add(job: SubagentJob): void {
		if (this.jobs.has(job.id)) {
			throw new Error(`Duplicate job id: ${job.id}`);
		}
		this.jobs.set(job.id, job);
		this.emit("change");
	}

	get(id: string): SubagentJob | undefined {
		return this.jobs.get(id);
	}

	update(id: string, patch: Partial<SubagentJob>): void {
		const job = this.jobs.get(id);
		if (!job) return;
		Object.assign(job, patch);
		this.emit("change");
	}

	remove(id: string): void {
		this.jobs.delete(id);
		this.emit("change");
	}

	kill(id: string): void {
		const job = this.jobs.get(id);
		if (job && job.status === "running") {
			job.abort();
		}
	}

	list(): SubagentJob[] {
		const arr = Array.from(this.jobs.values());
		// Sort: running first, then by startedAt desc
		return arr.sort((a, b) => {
			if (a.status === "running" && b.status !== "running") return -1;
			if (a.status !== "running" && b.status === "running") return 1;
			return b.startedAt - a.startedAt;
		});
	}

	countByStatus(status: SubagentJob["status"]): number {
		let count = 0;
		for (const job of this.jobs.values()) {
			if (job.status === status) count++;
		}
		return count;
	}

	countDone(): number {
		let count = 0;
		for (const job of this.jobs.values()) {
			if (job.status === "completed" || job.status === "failed" || job.status === "aborted") {
				count++;
			}
		}
		return count;
	}

	clear(): void {
		this.jobs.clear();
		this.emit("change");
	}

	pruneDone(olderThanMs: number): number {
		const now = Date.now();
		let removed = 0;
		for (const [id, job] of this.jobs) {
			if (
				(job.status === "completed" || job.status === "failed" || job.status === "aborted") &&
				job.endedAt &&
				now - job.endedAt > olderThanMs
			) {
				this.jobs.delete(id);
				removed++;
			}
		}
		if (removed > 0) this.emit("change");
		return removed;
	}
}
