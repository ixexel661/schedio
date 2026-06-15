import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import { computeNextRun } from "./compute.js";
import { describeSchedule } from "./describe.js";
import type {
	Job,
	JobHandle,
	RunOptions,
	ScheduleDescriptor,
} from "./types.js";
import { validateCount } from "./validation.js";

// Node.js setTimeout only accepts 32-bit signed integers (~24.8 days max)
const MAX_TIMEOUT_MS = 2_147_483_647;

// ── gcAfterRun support ───────────────────────────────────────────────────────
// undefined = not resolved yet, null = unavailable in this runtime.
let fallbackGc: (() => void) | null | undefined;
let warnedNoGc = false;

// Prefer an already-exposed global.gc; otherwise create one at runtime via the
// v8/vm trick, so gcAfterRun works without the `--expose-gc` launch flag.
function resolveGc(): (() => void) | null {
	const existing = (globalThis as { gc?: () => void }).gc;
	if (existing) return existing;
	if (fallbackGc === undefined) {
		try {
			setFlagsFromString("--expose-gc");
			const fn = runInNewContext("gc") as unknown;
			setFlagsFromString("--no-expose-gc");
			fallbackGc = typeof fn === "function" ? (fn as () => void) : null;
		} catch {
			fallbackGc = null;
		}
	}
	return fallbackGc;
}

function requestGc(): void {
	const gc = resolveGc();
	if (gc) {
		gc();
	} else if (!warnedNoGc) {
		warnedNoGc = true;
		console.warn(
			"schedio: gcAfterRun could not obtain a GC hook in this runtime.",
		);
	}
}

abstract class BaseJob implements JobHandle {
	protected timer: ReturnType<typeof setTimeout> | null = null;
	protected _active = true;
	protected _paused = false;
	// Absolute epoch-ms of the next scheduled fire, exposed via `nextRun`.
	protected nextRunMs: number | null = null;
	// Observability: time of the last run and total run count.
	protected lastRunMs: number | null = null;
	protected _runCount = 0;

	private readonly unref: boolean;
	private readonly gcAfterRun: boolean;
	private readonly signal: AbortSignal | undefined;
	private readonly onAbort: () => void;

	constructor(
		protected readonly job: Job,
		protected readonly options: RunOptions | undefined,
	) {
		this.unref = options?.unref ?? false;
		this.gcAfterRun = options?.gcAfterRun ?? false;
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

	get paused(): boolean {
		return this._paused;
	}

	get nextRun(): Date | null {
		return this._active && !this._paused && this.nextRunMs !== null
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
	abstract resume(): void;
	abstract nextRuns(count: number): Date[];

	stop(): void {
		this._active = false;
		if (this.timer !== null) {
			clearTimeout(this.timer);
			this.timer = null;
		}
		this.releaseSignal();
	}

	pause(): void {
		if (!this._active || this._paused) return;
		this._paused = true;
		if (this.timer !== null) {
			clearTimeout(this.timer);
			this.timer = null;
		}
	}

	/** Run the job once, off-schedule. Shared by manual `trigger()` and `pause()`-aware subclasses. */
	trigger(): Promise<void> {
		return this.invoke();
	}

	/** Detach the abort listener so a fired/stopped job doesn't linger on a shared signal. */
	protected releaseSignal(): void {
		this.signal?.removeEventListener("abort", this.onAbort);
	}

	/** Execute the job once: update observability and route errors through `onError`. */
	protected async invoke(): Promise<void> {
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
		} finally {
			// Release the job's memory now instead of letting it linger as RSS
			// until the next run reuses the heap.
			if (this.gcAfterRun) requestGc();
		}
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
		else this.scheduleNext(true);
	}

	private scheduleNext(rethrow = false): void {
		if (!this._active) return;

		const tz = this.desc.timezone ?? Temporal.Now.timeZoneId();
		// Use last scheduled fire time as base to prevent drift for seconds/minutes.
		// First call (scheduledMs === null) falls back to now, floored by .starting().
		// The -1ms keeps a slot landing exactly on `notBefore` inclusive.
		const floor = this.desc.notBeforeMs ?? Number.NEGATIVE_INFINITY;
		const baseMs = this.scheduledMs ?? Math.max(Date.now(), floor - 1);
		const base =
			Temporal.Instant.fromEpochMilliseconds(baseMs).toZonedDateTimeISO(tz);

		let nextMs: number;
		try {
			nextMs = computeNextRun(this.desc, base).toInstant().epochMilliseconds;
		} catch (err) {
			// A skip() filter rejected too many runs. On the first scheduling (from
			// .run()) rethrow so the bug surfaces synchronously; afterwards (inside a
			// timer) route to onError and stop instead of crashing the process.
			if (rethrow) throw err;
			try {
				this.options?.onError?.(err);
			} catch {
				/* onError must not throw */
			}
			this.stop();
			return;
		}

		this.scheduledMs = nextMs;

		const jitter =
			this.desc.jitterMs != null
				? Math.random() * 2 * this.desc.jitterMs - this.desc.jitterMs
				: 0;
		// scheduledMs stays un-jittered (drift base); the timer fires at the jittered target.
		const targetMs = this.scheduledMs + jitter;

		// .until(): stop once the actual (jittered) fire would pass the bound.
		if (this.desc.notAfterMs != null && targetMs > this.desc.notAfterMs) {
			this.stop();
			return;
		}

		this.nextRunMs = targetMs;
		this.armTimer(targetMs);
	}

	protected async fire(): Promise<void> {
		if (!this._active || this._paused) return;
		await this.invoke();
		if (this._active && !this._paused) {
			if (this.runsLeft !== null && --this.runsLeft <= 0) {
				this.stop();
			} else {
				this.scheduleNext();
			}
		}
	}

	resume(): void {
		if (!this._active || !this._paused) return;
		this._paused = false;
		// Recompute the next fire relative to now — missed fires aren't caught up.
		this.scheduledMs = null;
		this.scheduleNext();
	}

	nextRuns(count: number): Date[] {
		validateCount(count);
		if (!this._active || this.scheduledMs == null) return [];
		const tz = this.desc.timezone ?? Temporal.Now.timeZoneId();
		const out: number[] = [];
		let cursor: number | null = this.scheduledMs;
		let left = this.runsLeft;
		while (out.length < count && cursor != null && (left == null || left > 0)) {
			if (this.desc.notAfterMs != null && cursor > this.desc.notAfterMs) break;
			out.push(cursor);
			if (left != null) left--;
			const base =
				Temporal.Instant.fromEpochMilliseconds(cursor).toZonedDateTimeISO(tz);
			try {
				cursor = computeNextRun(this.desc, base).toInstant().epochMilliseconds;
			} catch {
				break; // skip() filter exhausted — stop the preview here
			}
		}
		return out.map((ms) => new Date(ms));
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
		if (!this._active || this._paused) return;
		this._active = false;
		this.releaseSignal();
		await this.invoke();
	}

	resume(): void {
		if (!this._active || !this._paused) return;
		this._paused = false;
		this.armTimer(this.targetMs); // a past target fires immediately
	}

	// Fire now instead of later: cancel the pending timer so it can't double-fire.
	override trigger(): Promise<void> {
		if (!this._active) return Promise.resolve();
		this._active = false;
		if (this.timer !== null) {
			clearTimeout(this.timer);
			this.timer = null;
		}
		this.releaseSignal();
		return this.invoke();
	}

	nextRuns(count: number): Date[] {
		validateCount(count);
		return this._active && this.nextRunMs != null
			? [new Date(this.nextRunMs)]
			: [];
	}

	toString(): string {
		return `once at ${new Date(this.targetMs).toISOString()}`;
	}
}

export { OneshotJob };
