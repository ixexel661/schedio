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

		// Build a ZonedDateTime from Date.now() so fake timers work in tests.
		// Temporal.Now.timeZoneId() only returns the tz name, not a time — safe to call always.
		const tz = this.desc.timezone ?? Temporal.Now.timeZoneId();
		const nowMs = Date.now();
		const now =
			Temporal.Instant.fromEpochMilliseconds(nowMs).toZonedDateTimeISO(tz);
		const nextRun = computeNextRun(this.desc, now);
		const delayMs = nextRun.toInstant().epochMilliseconds - nowMs;

		if (delayMs > MAX_TIMEOUT_MS) {
			this.timer = setTimeout(() => {
				if (this._active) this.scheduleNext();
			}, MAX_TIMEOUT_MS);
		} else {
			this.timer = setTimeout(
				() => {
					void this.fire();
				},
				Math.max(0, delayMs),
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
