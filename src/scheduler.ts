import { computeNextRun } from "./compute.js";
import { describeSchedule } from "./describe.js";
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
	// Absolute epoch-ms of the next scheduled fire, exposed via `nextRun`.
	protected nextRunMs: number | null = null;
	// Observability: time of the last run and total run count.
	protected lastRunMs: number | null = null;
	protected _runCount = 0;

	private readonly unref: boolean;
	private readonly signal: AbortSignal | undefined;
	private readonly onAbort: () => void;

	constructor(
		protected readonly job: Job,
		protected readonly options: RunOptions | undefined,
	) {
		this.unref = options?.unref ?? false;
		this.signal = options?.signal;
		this.onAbort = () => this.stop();
		if (this.signal) {
			if (this.signal.aborted) {
				this._active = false;
			} else {
				this.signal.addEventListener("abort", this.onAbort, { once: true });
			}
		}
	}

	get active(): boolean {
		return this._active;
	}

	get nextRun(): Date | null {
		return this._active && this.nextRunMs !== null
			? new Date(this.nextRunMs)
			: null;
	}

	get lastRun(): Date | null {
		return this.lastRunMs !== null ? new Date(this.lastRunMs) : null;
	}

	get runCount(): number {
		return this._runCount;
	}

	abstract toString(): string;

	stop(): void {
		this._active = false;
		if (this.timer !== null) {
			clearTimeout(this.timer);
			this.timer = null;
		}
		this.signal?.removeEventListener("abort", this.onAbort);
	}

	/** Arm a timer toward an absolute target, chunking around MAX_TIMEOUT_MS. */
	protected armTimer(targetMs: number): void {
		if (!this._active) return;
		const remaining = targetMs - Date.now();
		if (remaining > MAX_TIMEOUT_MS) {
			this.timer = this.setTimer(() => this.armTimer(targetMs), MAX_TIMEOUT_MS);
		} else {
			this.timer = this.setTimer(
				() => {
					void this.fire();
				},
				Math.max(0, remaining),
			);
		}
	}

	private setTimer(cb: () => void, ms: number): ReturnType<typeof setTimeout> {
		const t = setTimeout(() => {
			if (this._active) cb();
		}, ms);
		if (this.unref) t.unref?.();
		return t;
	}

	protected abstract fire(): Promise<void>;
}

export class ScheduledJob extends BaseJob {
	private runsLeft: number | null;
	// Un-jittered grid time of the last scheduled fire — the base for the next
	// computation, so seconds/minutes don't drift with job duration.
	private scheduledMs: number | null = null;

	constructor(
		private readonly desc: ScheduleDescriptor,
		job: Job,
		options?: RunOptions,
	) {
		super(job, options);
		this.runsLeft = desc.maxRuns ?? null;
		if (!this._active) return; // signal already aborted
		if (desc.runNow) void this.fire();
		else this.scheduleNext();
	}

	private scheduleNext(): void {
		if (!this._active) return;

		const tz = this.desc.timezone ?? Temporal.Now.timeZoneId();
		// Use last scheduled fire time as base to prevent drift for seconds/minutes.
		// First call (scheduledMs === null) falls back to now, floored by .starting().
		// The -1ms keeps a slot landing exactly on `notBefore` inclusive.
		const floor = this.desc.notBeforeMs ?? Number.NEGATIVE_INFINITY;
		const baseMs = this.scheduledMs ?? Math.max(Date.now(), floor - 1);
		const base =
			Temporal.Instant.fromEpochMilliseconds(baseMs).toZonedDateTimeISO(tz);
		this.scheduledMs = computeNextRun(
			this.desc,
			base,
		).toInstant().epochMilliseconds;

		// .until(): stop once the next fire would pass the bound.
		if (
			this.desc.notAfterMs != null &&
			this.scheduledMs > this.desc.notAfterMs
		) {
			this.stop();
			return;
		}

		const jitter =
			this.desc.jitterMs != null
				? Math.random() * 2 * this.desc.jitterMs - this.desc.jitterMs
				: 0;
		// scheduledMs stays un-jittered (drift base); the timer fires at the jittered target.
		const targetMs = this.scheduledMs + jitter;
		this.nextRunMs = targetMs;
		this.armTimer(targetMs);
	}

	protected async fire(): Promise<void> {
		if (!this._active) return;
		this.lastRunMs = Date.now();
		this._runCount++;
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

	toString(): string {
		return describeSchedule(this.desc);
	}
}

class OneshotJob extends BaseJob {
	private readonly targetMs: number;

	constructor(targetMs: number, job: Job, options?: RunOptions) {
		super(job, options);
		this.targetMs = targetMs;
		this.nextRunMs = targetMs;
		this.armTimer(targetMs);
	}

	protected async fire(): Promise<void> {
		if (!this._active) return;
		this._active = false;
		this.lastRunMs = Date.now();
		this._runCount++;
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

	toString(): string {
		return `once at ${new Date(this.targetMs).toISOString()}`;
	}
}

export { OneshotJob };
