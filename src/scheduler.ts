import { computeNextRun } from "./compute.js";
import type {
	Job,
	JobHandle,
	RunOptions,
	ScheduleDescriptor,
} from "./types.js";

// Node.js setTimeout only accepts 32-bit signed integers (~24.8 days max)
const MAX_TIMEOUT_MS = 2_147_483_647;

abstract class BaseJob implements JobHandle {
	protected timer: ReturnType<typeof setTimeout> | null = null;
	protected _active = true;

	constructor(
		protected readonly job: Job,
		protected readonly options: RunOptions | undefined,
	) {}

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
}

export class ScheduledJob extends BaseJob {
	private runsLeft: number | null;
	// Tracks the intended fire time so seconds/minutes don't drift with job duration
	private scheduledMs: number | null = null;

	constructor(
		private readonly desc: ScheduleDescriptor,
		job: Job,
		options?: RunOptions,
	) {
		super(job, options);
		this.runsLeft = desc.maxRuns ?? null;
		if (desc.runNow) void this.fire();
		else this.scheduleNext();
	}

	private scheduleNext(): void {
		if (!this._active) return;

		const tz = this.desc.timezone ?? Temporal.Now.timeZoneId();
		const nowMs = Date.now();
		// Use last scheduled fire time as base to prevent drift for seconds/minutes.
		// First call (scheduledMs === null) falls back to now.
		const baseMs = this.scheduledMs ?? nowMs;
		const base =
			Temporal.Instant.fromEpochMilliseconds(baseMs).toZonedDateTimeISO(tz);
		const nextRun = computeNextRun(this.desc, base);
		this.scheduledMs = nextRun.toInstant().epochMilliseconds;
		const baseDelay = this.scheduledMs - nowMs;

		const jitter =
			this.desc.jitterMs != null
				? Math.random() * 2 * this.desc.jitterMs - this.desc.jitterMs
				: 0;
		const delayMs = Math.max(0, baseDelay + jitter);

		if (delayMs > MAX_TIMEOUT_MS) {
			this.timer = setTimeout(() => {
				if (this._active) this.scheduleNext();
			}, MAX_TIMEOUT_MS);
		} else {
			this.timer = setTimeout(() => {
				void this.fire();
			}, delayMs);
		}
	}

	private async fire(): Promise<void> {
		if (!this._active) return;
		try {
			await this.job();
		} catch (err) {
			try {
				this.options?.onError?.(err);
			} catch {
				/* onError must not throw; swallow to keep schedule alive */
			}
		}
		if (this._active) {
			if (this.runsLeft !== null && --this.runsLeft <= 0) {
				this.stop();
			} else {
				this.scheduleNext();
			}
		}
	}
}

class OneshotJob extends BaseJob {
	constructor(targetMs: number, job: Job, options?: RunOptions) {
		super(job, options);
		this.armTimer(Math.max(0, targetMs - Date.now()));
	}

	private armTimer(remainingMs: number): void {
		if (remainingMs > MAX_TIMEOUT_MS) {
			this.timer = setTimeout(() => {
				if (this._active) this.armTimer(remainingMs - MAX_TIMEOUT_MS);
			}, MAX_TIMEOUT_MS);
		} else {
			this.timer = setTimeout(() => {
				void this.fire();
			}, remainingMs);
		}
	}

	private async fire(): Promise<void> {
		if (!this._active) return;
		this._active = false;
		try {
			await this.job();
		} catch (err) {
			try {
				this.options?.onError?.(err);
			} catch {
				/* onError must not throw; swallow to keep schedule alive */
			}
		}
	}
}

export { OneshotJob };
