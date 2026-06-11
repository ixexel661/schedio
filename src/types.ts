export type TimeUnit =
	| "second"
	| "minute"
	| "hour"
	| "day"
	| "week"
	| "month"
	| "year";

export type Weekday =
	| "monday"
	| "tuesday"
	| "wednesday"
	| "thursday"
	| "friday"
	| "saturday"
	| "sunday";

/** Ordinal position of a weekday within a month, used by `.on(ordinal, weekday)`. */
export type Ordinal = "first" | "second" | "third" | "fourth" | "last";

/** A time of day (used when a schedule fires at several times per day). */
export interface TimeOfDay {
	hour: number; // 0–23
	minute: number; // 0–59
}

export interface ScheduleOptions {
	/** IANA timezone name, e.g. `"Europe/Berlin"`. Defaults to the local system timezone. */
	timezone?: string;
}

export interface ScheduleDescriptor {
	every: number;
	unit: TimeUnit;
	timezone?: string;
	atMinute?: number;
	atHour?: number;
	atTimes?: readonly TimeOfDay[]; // multiple times of day (day/week/month/year units)
	weekdays?: readonly Weekday[]; // one or more target weekdays (for week unit)
	atDay?: number; // 1–31, day of month (for month/year units)
	atMonth?: number; // 1–12, month of year (for year unit)
	lastDayOfMonth?: boolean; // set by .on("last") — last day of the month
	nthWeekday?: { ordinal: Ordinal; weekday: Weekday }; // set by .on(ordinal, weekday)
	windowStartMin?: number; // set by .between() — window opens at this minute-of-day (interval units)
	windowEndMin?: number; // set by .between() — window closes at this minute-of-day (exclusive)
	skip?: (date: Date) => boolean; // set by .skip() — skip a fire when this returns true
	maxRuns?: number; // set by .times(n) — auto-stop after N runs
	jitterMs?: number; // set by .jitter(ms) — random ±ms spread per tick
	runNow?: boolean; // set by .runNow() — fire immediately on start
	notBeforeMs?: number; // set by .starting() — don't fire before this instant
	notAfterMs?: number; // set by .until() — stop once the next fire would pass this
}

export interface RunOptions {
	/**
	 * Called when the job throws an error. The schedule continues regardless.
	 * If not provided, errors are silently swallowed.
	 *
	 * @param err - The error thrown by the job.
	 */
	onError?: (err: unknown) => void;
	/**
	 * When `true`, the schedule's timers won't keep the Node.js process alive
	 * (calls `.unref()` on each timer). Useful for background tasks that should
	 * not block a graceful process exit.
	 */
	unref?: boolean;
	/**
	 * An `AbortSignal` that stops the schedule when aborted (equivalent to
	 * calling `stop()`). If the signal is already aborted, the job never runs.
	 */
	signal?: AbortSignal;
}

/** Handle returned by `.run()`. Use it to check status or cancel the schedule. */
export interface JobHandle {
	/** Cancel the schedule and prevent any future executions. */
	stop(): void;
	/**
	 * Temporarily halt the schedule without cancelling it. The pending timer is
	 * cleared; no fires occur until `resume()`. Idempotent. Has no effect once stopped.
	 */
	pause(): void;
	/**
	 * Resume a paused schedule. The next fire is computed relative to now (missed
	 * fires during the pause are not caught up). Idempotent; no effect if not paused.
	 */
	resume(): void;
	/**
	 * Run the job immediately, off-schedule. Increments `runCount`/`lastRun` and
	 * routes errors through `onError`, but does not reschedule, does not consume the
	 * `.times(n)` budget, and leaves the pending timer untouched.
	 *
	 * @returns A promise that resolves when the manual run completes.
	 */
	trigger(): Promise<void>;
	/** `true` while the schedule is running; `false` after `stop()` or after `.times(n)` is exhausted. */
	readonly active: boolean;
	/** `true` while paused via `pause()` (still active, but not firing). */
	readonly paused: boolean;
	/** The next scheduled fire time (including jitter), or `null` if stopped/paused/inactive. */
	readonly nextRun: Date | null;
	/**
	 * The next `count` scheduled fire times (un-jittered grid times), respecting
	 * `.until()` and remaining `.times(n)`. Empty once stopped.
	 */
	nextRuns(count: number): Date[];
	/** The time of the most recent execution, or `null` if the job hasn't run yet. */
	readonly lastRun: Date | null;
	/** How many times the job has executed so far. */
	readonly runCount: number;
	/** A human-readable description of the schedule, e.g. `"every day at 08:30"`. */
	toString(): string;
}

/** A job function — sync or async, no return value. */
export type Job = () => void | Promise<void>;
