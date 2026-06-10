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
	weekday?: Weekday;
	atDay?: number; // 1–31, day of month (for month/year units)
	atMonth?: number; // 1–12, month of year (for year unit)
	maxRuns?: number; // set by .times(n) — auto-stop after N runs
	jitterMs?: number; // set by .jitter(ms) — random ±ms spread per tick
	runNow?: boolean; // set by .runNow() — fire immediately on start
}

export interface RunOptions {
	/**
	 * Called when the job throws an error. The schedule continues regardless.
	 * If not provided, errors are silently swallowed.
	 *
	 * @param err - The error thrown by the job.
	 */
	onError?: (err: unknown) => void;
}

/** Handle returned by `.run()`. Use it to check status or cancel the schedule. */
export interface JobHandle {
	/** Cancel the schedule and prevent any future executions. */
	stop(): void;
	/** `true` while the schedule is running; `false` after `stop()` or after `.times(n)` is exhausted. */
	readonly active: boolean;
}

/** A job function — sync or async, no return value. */
export type Job = () => void | Promise<void>;
