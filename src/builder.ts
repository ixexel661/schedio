import { OneshotJob, ScheduledJob } from "./scheduler.js";
import type {
	Job,
	JobHandle,
	RunOptions,
	ScheduleDescriptor,
	ScheduleOptions,
	Weekday,
} from "./types.js";
import {
	validateAtMinute,
	validateAtTime,
	validateEvery,
	validateJitter,
	validateOnDay,
	validateOnMonthDay,
	validateTimes,
	validateTimezone,
} from "./validation.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveTargetMs(
	target: string | Temporal.Instant | Temporal.ZonedDateTime,
	timezone: string | undefined,
): number {
	if (typeof target !== "string") {
		return "timeZoneId" in target
			? target.toInstant().epochMilliseconds
			: target.epochMilliseconds;
	}
	if (target.includes("[")) {
		return Temporal.ZonedDateTime.from(target).toInstant().epochMilliseconds;
	}
	if (/Z$|[+-]\d{2}:\d{2}$/.test(target)) {
		return Temporal.Instant.from(target).epochMilliseconds;
	}
	// Plain datetime without timezone — interpret in the configured/local timezone
	const tz = timezone ?? Temporal.Now.timeZoneId();
	return Temporal.ZonedDateTime.from(`${target}[${tz}]`).toInstant()
		.epochMilliseconds;
}

// ── once() steps ──────────────────────────────────────────────────────────────

export class OnceFiredStep {
	private readonly targetMs: number;
	constructor(targetMs: number) {
		this.targetMs = targetMs;
	}
	/** Register the job and start the one-shot timer. Returns a handle to cancel it. */
	run(job: Job, options?: RunOptions): JobHandle {
		return new OneshotJob(this.targetMs, job, options);
	}
}

export class OnceStep {
	private readonly timezone: string | undefined;
	constructor(timezone: string | undefined) {
		this.timezone = timezone;
	}
	/**
	 * Set the target datetime for the one-shot job.
	 *
	 * Accepts an ISO 8601 string (`"2025-06-01T09:00:00Z"`), a `Temporal.Instant`,
	 * or a `Temporal.ZonedDateTime`. Strings without a timezone offset are
	 * interpreted in the configured schedule timezone (or the local system timezone).
	 */
	at(
		target: string | Temporal.Instant | Temporal.ZonedDateTime,
	): OnceFiredStep {
		try {
			return new OnceFiredStep(resolveTargetMs(target, this.timezone));
		} catch (e) {
			throw new RangeError(
				`schedio: once().at() received an invalid datetime: ${String(target)}`,
				{ cause: e },
			);
		}
	}
}

// ── Terminal step ─────────────────────────────────────────────────────────────

export class RunStep {
	constructor(protected readonly desc: ScheduleDescriptor) {}

	/** Stop automatically after `n` executions. */
	times(n: number): RunStep {
		validateTimes(n);
		return new RunStep({ ...this.desc, maxRuns: n });
	}

	/**
	 * Add random jitter of ±`ms` milliseconds to each scheduled delay.
	 * Useful to spread load when many instances start at the same time.
	 */
	jitter(ms: number): RunStep {
		validateJitter(ms);
		return new RunStep({ ...this.desc, jitterMs: ms });
	}

	/** Fire the job once immediately when the schedule is created, then continue on the normal interval. */
	runNow(): RunStep {
		return new RunStep({ ...this.desc, runNow: true });
	}

	/**
	 * Register the job and start the schedule. Returns a handle with `stop()` and `active`.
	 *
	 * @param job - Async or sync function to execute on each tick.
	 * @param options - Optional `onError` callback invoked when the job throws.
	 */
	run(job: Job, options?: RunOptions): JobHandle {
		return new ScheduledJob(this.desc, job, options);
	}
}

// ── At-time steps (extend RunStep so .at() is optional) ──────────────────────

export class AtMinuteStep extends RunStep {
	/** Fire at the given minute within each hour (0–59). Defaults to `:00` if omitted. */
	at(minute: number): RunStep {
		validateAtMinute(minute);
		return new RunStep({ ...this.desc, atMinute: minute });
	}
}

export class AtTimeStep extends RunStep {
	/**
	 * Fire at the given time of day.
	 *
	 * - **Number** — hour in 24 h format (0–23), e.g. `at(9)` → 09:00.
	 * - **String** — `"HH:MM"` format, e.g. `at("09:30")`. Single-digit hours are accepted.
	 *
	 * Defaults to midnight (`00:00`) if omitted.
	 */
	at(time: string | number): RunStep {
		validateAtTime(time);
		if (typeof time === "number") {
			return new RunStep({ ...this.desc, atHour: time, atMinute: 0 });
		}
		const [h = "0", m = "0"] = time.split(":");
		return new RunStep({
			...this.desc,
			atHour: parseInt(h, 10),
			atMinute: parseInt(m, 10),
		});
	}
}

// ── Day-of-month step (for .months()) ────────────────────────────────────────

export class AtDayStep extends RunStep {
	/**
	 * Fire on the given day of the month (1–31).
	 * Days that don't exist in a given month are clamped to the last valid day
	 * (e.g. day 31 in February → February 28/29).
	 */
	on(day: number): AtTimeStep {
		validateOnDay(day);
		return new AtTimeStep({ ...this.desc, atDay: day });
	}
}

// ── Month-day step (for .years()) ─────────────────────────────────────────────

export class AtMonthDayStep extends RunStep {
	/**
	 * Fire on a specific month and day each year.
	 * Accepts `"MM-DD"` format, e.g. `"03-15"` for March 15th.
	 * Invalid days are clamped (e.g. `"02-30"` → February 28/29).
	 */
	on(monthDay: string): AtTimeStep {
		validateOnMonthDay(monthDay);
		const [m = "1", d = "1"] = monthDay.split("-");
		return new AtTimeStep({
			...this.desc,
			atMonth: parseInt(m, 10),
			atDay: parseInt(d, 10),
		});
	}
}

// ── Weekday-or-at step (for .weeks()) ────────────────────────────────────────

export class WeekdayOrAtStep extends RunStep {
	/** Fire every Monday. Chain `.at()` to set the time of day. */
	monday(): AtTimeStep {
		return this.withWeekday("monday");
	}
	/** Fire every Tuesday. Chain `.at()` to set the time of day. */
	tuesday(): AtTimeStep {
		return this.withWeekday("tuesday");
	}
	/** Fire every Wednesday. Chain `.at()` to set the time of day. */
	wednesday(): AtTimeStep {
		return this.withWeekday("wednesday");
	}
	/** Fire every Thursday. Chain `.at()` to set the time of day. */
	thursday(): AtTimeStep {
		return this.withWeekday("thursday");
	}
	/** Fire every Friday. Chain `.at()` to set the time of day. */
	friday(): AtTimeStep {
		return this.withWeekday("friday");
	}
	/** Fire every Saturday. Chain `.at()` to set the time of day. */
	saturday(): AtTimeStep {
		return this.withWeekday("saturday");
	}
	/** Fire every Sunday. Chain `.at()` to set the time of day. */
	sunday(): AtTimeStep {
		return this.withWeekday("sunday");
	}

	private withWeekday(weekday: Weekday): AtTimeStep {
		return new AtTimeStep({ ...this.desc, weekday });
	}
}

// ── Unit step — selects the time unit after .every(n) ────────────────────────

export class UnitStep {
	constructor(
		private readonly desc: Partial<ScheduleDescriptor> & { every: number },
	) {}

	/** Alias for {@link seconds}. */
	second(): RunStep {
		return this.seconds();
	}
	/** Fire every N seconds. */
	seconds(): RunStep {
		return new RunStep({ ...this.desc, unit: "second" });
	}

	/** Alias for {@link minutes}. */
	minute(): RunStep {
		return this.minutes();
	}
	/** Fire every N minutes. */
	minutes(): RunStep {
		return new RunStep({ ...this.desc, unit: "minute" });
	}

	/** Alias for {@link hours}. */
	hour(): AtMinuteStep {
		return this.hours();
	}
	/** Fire every N hours. Optionally chain `.at(minute)` to pin the minute within each hour. */
	hours(): AtMinuteStep {
		return new AtMinuteStep({ ...this.desc, unit: "hour" });
	}

	/** Alias for {@link days}. */
	day(): AtTimeStep {
		return this.days();
	}
	/** Fire every N days. Optionally chain `.at()` to set the time of day. */
	days(): AtTimeStep {
		return new AtTimeStep({ ...this.desc, unit: "day" });
	}

	/** Alias for {@link weeks}. */
	week(): WeekdayOrAtStep {
		return this.weeks();
	}
	/** Fire every N weeks. Optionally chain `.monday()`…`.sunday()` and/or `.at()`. */
	weeks(): WeekdayOrAtStep {
		return new WeekdayOrAtStep({ ...this.desc, unit: "week" });
	}

	/** Alias for {@link months}. */
	month(): AtDayStep {
		return this.months();
	}
	/** Fire every N months. Optionally chain `.on(day)` to set the day of month, then `.at()`. */
	months(): AtDayStep {
		return new AtDayStep({ ...this.desc, unit: "month" });
	}

	/** Alias for {@link years}. */
	year(): AtMonthDayStep {
		return this.years();
	}
	/** Fire every N years. Optionally chain `.on("MM-DD")` to set the date, then `.at()`. */
	years(): AtMonthDayStep {
		return new AtMonthDayStep({ ...this.desc, unit: "year" });
	}

	/** Shorthand for `.weeks().monday()` — fire every Monday. */
	monday(): AtTimeStep {
		return this.weeks().monday();
	}
	/** Shorthand for `.weeks().tuesday()` — fire every Tuesday. */
	tuesday(): AtTimeStep {
		return this.weeks().tuesday();
	}
	/** Shorthand for `.weeks().wednesday()` — fire every Wednesday. */
	wednesday(): AtTimeStep {
		return this.weeks().wednesday();
	}
	/** Shorthand for `.weeks().thursday()` — fire every Thursday. */
	thursday(): AtTimeStep {
		return this.weeks().thursday();
	}
	/** Shorthand for `.weeks().friday()` — fire every Friday. */
	friday(): AtTimeStep {
		return this.weeks().friday();
	}
	/** Shorthand for `.weeks().saturday()` — fire every Saturday. */
	saturday(): AtTimeStep {
		return this.weeks().saturday();
	}
	/** Shorthand for `.weeks().sunday()` — fire every Sunday. */
	sunday(): AtTimeStep {
		return this.weeks().sunday();
	}
}

// ── Entry step ────────────────────────────────────────────────────────────────

export class EveryStep {
	private readonly timezone: string | undefined;

	constructor(options?: ScheduleOptions) {
		if (options?.timezone !== undefined) validateTimezone(options.timezone);
		this.timezone = options?.timezone;
	}

	/**
	 * Set the repeat interval. Omit `n` (or pass `1`) for "every unit".
	 *
	 * @param n - Positive integer multiplier (default `1`). Must be ≥ 1.
	 * @example
	 * schedule().every(5).minutes().run(job)   // every 5 minutes
	 * schedule().every().hours().run(job)       // every hour
	 */
	every(n?: number): UnitStep {
		if (n !== undefined) validateEvery(n);
		return new UnitStep({ every: n ?? 1, timezone: this.timezone });
	}

	/**
	 * Schedule a job to run exactly once at a specific datetime.
	 * Chain `.at(target)` to set the time, then `.run(job)`.
	 *
	 * @example
	 * schedule().once().at("2025-12-31T23:59:00Z").run(job)
	 */
	once(): OnceStep {
		return new OnceStep(this.timezone);
	}
}

// ── Public factory ────────────────────────────────────────────────────────────

/**
 * Create a new schedule builder.
 *
 * @param options - Optional global options (e.g. `timezone`).
 * @example
 * // Every weekday at 09:00 Europe/Berlin
 * schedule({ timezone: "Europe/Berlin" })
 *   .every().monday().at("09:00")
 *   .run(() => console.log("Good morning!"));
 *
 * // Once at a specific UTC time
 * schedule().once().at("2025-06-15T12:00:00Z").run(sendReport);
 */
export function schedule(options?: ScheduleOptions): EveryStep {
	return new EveryStep(options);
}
