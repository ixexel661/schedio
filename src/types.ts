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
	/** IANA timezone name, e.g. "Europe/Berlin". Defaults to the local system timezone. */
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

export interface JobHandle {
	stop(): void;
	readonly active: boolean;
}

export type Job = () => void | Promise<void>;
