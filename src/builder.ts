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
	run(job: Job, options?: RunOptions): JobHandle {
		return new OneshotJob(this.targetMs, job, options);
	}
}

export class OnceStep {
	private readonly timezone: string | undefined;
	constructor(timezone: string | undefined) {
		this.timezone = timezone;
	}
	at(
		target: string | Temporal.Instant | Temporal.ZonedDateTime,
	): OnceFiredStep {
		try {
			return new OnceFiredStep(resolveTargetMs(target, this.timezone));
		} catch {
			throw new RangeError(
				`schedio: once().at() received an invalid datetime: ${String(target)}`,
			);
		}
	}
}

// ── Terminal step ─────────────────────────────────────────────────────────────

export class RunStep {
	constructor(protected readonly desc: ScheduleDescriptor) {}

	times(n: number): RunStep {
		validateTimes(n);
		return new RunStep({ ...this.desc, maxRuns: n });
	}

	jitter(ms: number): RunStep {
		validateJitter(ms);
		return new RunStep({ ...this.desc, jitterMs: ms });
	}

	runNow(): RunStep {
		return new RunStep({ ...this.desc, runNow: true });
	}

	run(job: Job, options?: RunOptions): JobHandle {
		return new ScheduledJob(this.desc, job, options);
	}
}

// ── At-time steps (extend RunStep so .at() is optional) ──────────────────────

export class AtMinuteStep extends RunStep {
	at(minute: number): RunStep {
		validateAtMinute(minute);
		return new RunStep({ ...this.desc, atMinute: minute });
	}
}

export class AtTimeStep extends RunStep {
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
	on(day: number): AtTimeStep {
		validateOnDay(day);
		return new AtTimeStep({ ...this.desc, atDay: day });
	}
}

// ── Month-day step (for .years()) ─────────────────────────────────────────────

export class AtMonthDayStep extends RunStep {
	/** Accept "MM-DD" format, e.g. "03-15" for March 15th. */
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
	monday(): AtTimeStep {
		return this.withWeekday("monday");
	}
	tuesday(): AtTimeStep {
		return this.withWeekday("tuesday");
	}
	wednesday(): AtTimeStep {
		return this.withWeekday("wednesday");
	}
	thursday(): AtTimeStep {
		return this.withWeekday("thursday");
	}
	friday(): AtTimeStep {
		return this.withWeekday("friday");
	}
	saturday(): AtTimeStep {
		return this.withWeekday("saturday");
	}
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

	second(): RunStep {
		return this.seconds();
	}
	seconds(): RunStep {
		return new RunStep({ ...this.desc, unit: "second" });
	}

	minute(): RunStep {
		return this.minutes();
	}
	minutes(): RunStep {
		return new RunStep({ ...this.desc, unit: "minute" });
	}

	hour(): AtMinuteStep {
		return this.hours();
	}
	hours(): AtMinuteStep {
		return new AtMinuteStep({ ...this.desc, unit: "hour" });
	}

	day(): AtTimeStep {
		return this.days();
	}
	days(): AtTimeStep {
		return new AtTimeStep({ ...this.desc, unit: "day" });
	}

	week(): WeekdayOrAtStep {
		return this.weeks();
	}
	weeks(): WeekdayOrAtStep {
		return new WeekdayOrAtStep({ ...this.desc, unit: "week" });
	}

	month(): AtDayStep {
		return this.months();
	}
	months(): AtDayStep {
		return new AtDayStep({ ...this.desc, unit: "month" });
	}

	year(): AtMonthDayStep {
		return this.years();
	}
	years(): AtMonthDayStep {
		return new AtMonthDayStep({ ...this.desc, unit: "year" });
	}

	monday(): AtTimeStep {
		return this.weeks().monday();
	}
	tuesday(): AtTimeStep {
		return this.weeks().tuesday();
	}
	wednesday(): AtTimeStep {
		return this.weeks().wednesday();
	}
	thursday(): AtTimeStep {
		return this.weeks().thursday();
	}
	friday(): AtTimeStep {
		return this.weeks().friday();
	}
	saturday(): AtTimeStep {
		return this.weeks().saturday();
	}
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

	every(n?: number): UnitStep {
		if (n !== undefined) validateEvery(n);
		return new UnitStep({ every: n ?? 1, timezone: this.timezone });
	}

	once(): OnceStep {
		return new OnceStep(this.timezone);
	}
}

// ── Public factory ────────────────────────────────────────────────────────────

export function schedule(options?: ScheduleOptions): EveryStep {
	return new EveryStep(options);
}
