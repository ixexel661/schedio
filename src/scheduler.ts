import { computeNextRun } from "./compute.js";
import type { Job, JobHandle, ScheduleDescriptor } from "./types.js";

// Node.js setTimeout only accepts 32-bit signed integers (~24.8 days max)
const MAX_TIMEOUT_MS = 2_147_483_647;

export class ScheduledJob implements JobHandle {
	private timer: ReturnType<typeof setTimeout> | null = null;
	private _active = true;

	constructor(
		private readonly desc: ScheduleDescriptor,
		private readonly job: Job,
	) {
		this.scheduleNext();
	}

	get active(): boolean {
		return this._active;
	}

	stop(): void {
		this._active = false;
		if (this.timer !== null) {
			clearTimeout(this.timer);
			this.timer = null;
		}
	}

	private scheduleNext(): void {
		if (!this._active) return;
		const nextRun = computeNextRun(this.desc, new Date());
		const delay = nextRun.getTime() - Date.now();

		if (delay > MAX_TIMEOUT_MS) {
			// Split into a safe chunk and re-check when it fires
			this.timer = setTimeout(() => {
				if (this._active) this.scheduleNext();
			}, MAX_TIMEOUT_MS);
		} else {
			this.timer = setTimeout(
				() => {
					void this.fire();
				},
				Math.max(0, delay),
			);
		}
	}

	private async fire(): Promise<void> {
		if (!this._active) return;
		try {
			await this.job();
		} catch {
			// Job errors are intentionally ignored — the schedule continues regardless
		} finally {
			if (this._active) this.scheduleNext();
		}
	}
}
