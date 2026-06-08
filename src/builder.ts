import { ScheduledJob } from "./scheduler.js";
import type {
	Job,
	JobHandle,
	ScheduleDescriptor,
	ScheduleOptions,
	Weekday,
} from "./types.js";

// ── Terminal step ─────────────────────────────────────────────────────────────

export class RunStep {
	constructor(protected readonly desc: ScheduleDescriptor) {}

	run(job: Job): JobHandle {
		return new ScheduledJob(this.desc, job);
	}
}

// ── At-time steps (extend RunStep so .at() is optional) ──────────────────────

export class AtMinuteStep extends RunStep {
	at(minute: number): RunStep {
		return new RunStep({ ...this.desc, atMinute: minute });
	}
}

export class AtTimeStep extends RunStep {
	at(time: string | number): RunStep {
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
		return new AtTimeStep({ ...this.desc, atDay: day });
	}
}

// ── Month-day step (for .years()) ─────────────────────────────────────────────

export class AtMonthDayStep extends RunStep {
	/** Accept "MM-DD" format, e.g. "03-15" for March 15th. */
	on(monthDay: string): AtTimeStep {
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

	second(): RunStep { return this.seconds(); }
	seconds(): RunStep {
		return new RunStep({ ...this.desc, unit: "second" });
	}

	minute(): RunStep { return this.minutes(); }
	minutes(): RunStep {
		return new RunStep({ ...this.desc, unit: "minute" });
	}

	hour(): AtMinuteStep { return this.hours(); }
	hours(): AtMinuteStep {
		return new AtMinuteStep({ ...this.desc, unit: "hour" });
	}

	day(): AtTimeStep { return this.days(); }
	days(): AtTimeStep {
		return new AtTimeStep({ ...this.desc, unit: "day" });
	}

	week(): WeekdayOrAtStep { return this.weeks(); }
	weeks(): WeekdayOrAtStep {
		return new WeekdayOrAtStep({ ...this.desc, unit: "week" });
	}

	month(): AtDayStep { return this.months(); }
	months(): AtDayStep {
		return new AtDayStep({ ...this.desc, unit: "month" });
	}

	year(): AtMonthDayStep { return this.years(); }
	years(): AtMonthDayStep {
		return new AtMonthDayStep({ ...this.desc, unit: "year" });
	}

	monday(): AtTimeStep {
		return this.namedWeekday("monday");
	}
	tuesday(): AtTimeStep {
		return this.namedWeekday("tuesday");
	}
	wednesday(): AtTimeStep {
		return this.namedWeekday("wednesday");
	}
	thursday(): AtTimeStep {
		return this.namedWeekday("thursday");
	}
	friday(): AtTimeStep {
		return this.namedWeekday("friday");
	}
	saturday(): AtTimeStep {
		return this.namedWeekday("saturday");
	}
	sunday(): AtTimeStep {
		return this.namedWeekday("sunday");
	}

	private namedWeekday(weekday: Weekday): AtTimeStep {
		return new AtTimeStep({ ...this.desc, unit: "week", weekday });
	}
}

// ── Entry step ────────────────────────────────────────────────────────────────

export class EveryStep {
	private readonly timezone: string | undefined;

	constructor(options?: ScheduleOptions) {
		this.timezone = options?.timezone;
	}

	every(n?: number): UnitStep {
		return new UnitStep({ every: n ?? 1, timezone: this.timezone });
	}
}

// ── Public factory ────────────────────────────────────────────────────────────

export function schedule(options?: ScheduleOptions): EveryStep {
	return new EveryStep(options);
}
