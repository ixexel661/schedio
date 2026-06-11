import { timesOf } from "./fields.js";
import type {
	Ordinal,
	ScheduleDescriptor,
	TimeOfDay,
	Weekday,
} from "./types.js";

// Temporal uses ISO weekday numbers (Mon=1 … Sun=7)
const TEMPORAL_WEEKDAY: Record<Weekday, number> = {
	monday: 1,
	tuesday: 2,
	wednesday: 3,
	thursday: 4,
	friday: 5,
	saturday: 6,
	sunday: 7,
};

const ORDINAL_INDEX: Record<Ordinal, number> = {
	first: 0,
	second: 1,
	third: 2,
	fourth: 3,
	last: -1,
};

function earliest(
	candidates: Temporal.ZonedDateTime[],
): Temporal.ZonedDateTime {
	return candidates.reduce((a, b) =>
		Temporal.ZonedDateTime.compare(a, b) <= 0 ? a : b,
	);
}

function withTime(
	zdt: Temporal.ZonedDateTime,
	time: TimeOfDay,
): Temporal.ZonedDateTime {
	return zdt.with({
		hour: time.hour,
		minute: time.minute,
		second: 0,
		millisecond: 0,
	});
}

// Skip filters can reject runs; cap the look-ahead so a filter that rejects
// everything (e.g. `() => true`) fails fast instead of looping forever.
const MAX_SKIP_ITERATIONS = 1000;

/**
 * The next scheduled fire after `from`, honoring an optional `.skip()` filter.
 * Used by both the scheduler and `nextRuns()` so they always agree.
 */
export function computeNextRun(
	desc: ScheduleDescriptor,
	from: Temporal.ZonedDateTime,
): Temporal.ZonedDateTime {
	let candidate = computeRawNext(desc, from);
	if (!desc.skip) return candidate;
	for (let i = 0; i < MAX_SKIP_ITERATIONS; i++) {
		const date = new Date(candidate.toInstant().epochMilliseconds);
		if (!desc.skip(date)) return candidate;
		// computeRawNext advances past a candidate equal to `from`, so this is strictly later.
		candidate = computeRawNext(desc, candidate);
	}
	throw new RangeError(
		`schedio: skip() rejected ${MAX_SKIP_ITERATIONS} consecutive runs — possible infinite filter`,
	);
}

function computeRawNext(
	desc: ScheduleDescriptor,
	from: Temporal.ZonedDateTime,
): Temporal.ZonedDateTime {
	switch (desc.unit) {
		case "second":
			return clampToWindow(from.add({ seconds: desc.every }), desc);
		case "minute":
			return clampToWindow(from.add({ minutes: desc.every }), desc);
		case "hour":
			return clampToWindow(computeNextHour(desc, from), desc);
		case "day":
			return computeNextDay(desc, from);
		case "week":
			return computeNextWeek(desc, from);
		case "month":
			return computeNextMonth(desc, from);
		case "year":
			return computeNextYear(desc, from);
	}
}

// ── .between() time-of-day window (second/minute/hour units) ─────────────────

// The first in-window fire on `day`: for hour schedules the earliest `HH:atMinute`
// at or after the window start; otherwise the window-start time exactly.
function windowOpenOn(
	day: Temporal.ZonedDateTime,
	desc: ScheduleDescriptor,
	windowStartMin: number,
): Temporal.ZonedDateTime {
	if (desc.unit === "hour") {
		const atMin = desc.atMinute ?? 0;
		const hour = Math.max(0, Math.ceil((windowStartMin - atMin) / 60));
		return day.with({ hour, minute: atMin, second: 0, millisecond: 0 });
	}
	return day.with({
		hour: Math.floor(windowStartMin / 60),
		minute: windowStartMin % 60,
		second: 0,
		millisecond: 0,
	});
}

// Move a candidate that falls outside the [start, end) window to the next window
// opening (same day if before it, next day if at/after the close).
function clampToWindow(
	candidate: Temporal.ZonedDateTime,
	desc: ScheduleDescriptor,
): Temporal.ZonedDateTime {
	if (desc.windowStartMin == null || desc.windowEndMin == null)
		return candidate;
	const secOfDay =
		candidate.hour * 3600 + candidate.minute * 60 + candidate.second;
	const startSec = desc.windowStartMin * 60;
	const endSec = desc.windowEndMin * 60;
	if (secOfDay >= startSec && secOfDay < endSec) return candidate;
	const day = secOfDay >= endSec ? candidate.add({ days: 1 }) : candidate;
	return windowOpenOn(day, desc, desc.windowStartMin);
}

function computeNextHour(
	desc: ScheduleDescriptor,
	from: Temporal.ZonedDateTime,
): Temporal.ZonedDateTime {
	// Hour schedules pin only the minute; `atTimes` never reaches here because the
	// builder's `.hours()` returns AtMinuteStep, whose `.at()` sets atMinute only.
	const atMinute = desc.atMinute ?? 0;
	let candidate = from.with({ minute: atMinute, second: 0, millisecond: 0 });

	if (Temporal.ZonedDateTime.compare(candidate, from) <= 0) {
		candidate = candidate.add({ hours: desc.every });
	}

	if (desc.every > 1) {
		const epochHours = Math.floor(
			candidate.toInstant().epochMilliseconds / 3_600_000,
		);
		const remainder = epochHours % desc.every;
		if (remainder !== 0) {
			candidate = candidate.add({ hours: desc.every - remainder });
		}
	}

	return candidate;
}

function computeNextDay(
	desc: ScheduleDescriptor,
	from: Temporal.ZonedDateTime,
): Temporal.ZonedDateTime {
	return earliest(timesOf(desc).map((t) => nextForDay(desc, from, t)));
}

function nextForDay(
	desc: ScheduleDescriptor,
	from: Temporal.ZonedDateTime,
	time: TimeOfDay,
): Temporal.ZonedDateTime {
	let candidate = withTime(from, time);

	if (Temporal.ZonedDateTime.compare(candidate, from) <= 0) {
		candidate = candidate.add({ days: desc.every });
	}

	if (desc.every > 1) {
		const refDate = Temporal.PlainDate.from("1970-01-01");
		const candidateDate = candidate.toPlainDate();
		const daysSinceEpoch = refDate.until(candidateDate, {
			largestUnit: "days",
		}).days;
		const remainder = daysSinceEpoch % desc.every;
		if (remainder !== 0) {
			candidate = candidate.add({ days: desc.every - remainder });
		}
	}

	// Re-resolve the wall-clock time on the final date so a DST spring-forward gap
	// on the starting day doesn't drift the time on subsequent days.
	return withTime(candidate, time);
}

function computeNextWeek(
	desc: ScheduleDescriptor,
	from: Temporal.ZonedDateTime,
): Temporal.ZonedDateTime {
	const times = timesOf(desc);

	if (desc.weekdays && desc.weekdays.length > 0) {
		// Compute the next occurrence of each (weekday × time), then pick the soonest.
		const candidates: Temporal.ZonedDateTime[] = [];
		for (const w of desc.weekdays) {
			for (const t of times) {
				candidates.push(
					nextForWeekday(desc, from, TEMPORAL_WEEKDAY[w], true, t),
				);
			}
		}
		return earliest(candidates);
	}

	// No specific weekday: repeat on the same weekday as `from`, no epoch anchoring.
	const candidates = times.map((t) => {
		const base = withTime(from, t);
		return nextForWeekday(desc, from, base.dayOfWeek, false, t);
	});
	return earliest(candidates);
}

function nextForWeekday(
	desc: ScheduleDescriptor,
	from: Temporal.ZonedDateTime,
	targetDayOfWeek: number,
	anchored: boolean,
	time: TimeOfDay,
): Temporal.ZonedDateTime {
	let candidate = withTime(from, time);

	const daysUntilTarget = (targetDayOfWeek - candidate.dayOfWeek + 7) % 7;
	candidate = candidate.add({ days: daysUntilTarget });

	if (Temporal.ZonedDateTime.compare(candidate, from) <= 0) {
		candidate = candidate.add({ weeks: desc.every });
	}

	if (desc.every > 1 && anchored) {
		// Anchor weeks to the first occurrence of the target weekday on or after 1970-01-01.
		// 1970-01-01 was a Thursday (dayOfWeek 4). daysToRef brings us to the epoch's
		// first instance of targetDayOfWeek, ensuring every(N).weeks().monday() aligns
		// to a consistent Monday-based grid rather than the arbitrary Thursday epoch.
		const epochDow = 4; // Thursday = 4
		const daysToRef = (targetDayOfWeek - epochDow + 7) % 7;
		const refDate = Temporal.PlainDate.from("1970-01-01").add({
			days: daysToRef,
		});
		const candidateDate = candidate.toPlainDate();
		const daysSinceRef = refDate.until(candidateDate, {
			largestUnit: "days",
		}).days;
		const weeksSinceRef = Math.floor(daysSinceRef / 7);
		const remainder = weeksSinceRef % desc.every;
		if (remainder !== 0) {
			candidate = candidate.add({ weeks: desc.every - remainder });
		}
	}

	// Re-resolve the wall-clock time so a DST spring-forward gap on the starting
	// day doesn't drift the time on the resulting weekday.
	return withTime(candidate, time);
}

function computeNextMonth(
	desc: ScheduleDescriptor,
	from: Temporal.ZonedDateTime,
): Temporal.ZonedDateTime {
	return earliest(timesOf(desc).map((t) => nextForMonth(desc, from, t)));
}

function nextForMonth(
	desc: ScheduleDescriptor,
	from: Temporal.ZonedDateTime,
	time: TimeOfDay,
): Temporal.ZonedDateTime {
	let candidate = buildMonthly(from, desc, time);
	if (Temporal.ZonedDateTime.compare(candidate, from) <= 0) {
		candidate = buildMonthly(from.add({ months: desc.every }), desc, time);
	}
	return candidate;
}

// Build the fire time within the month of `monthRef`, resolving the day for that month.
function buildMonthly(
	monthRef: Temporal.ZonedDateTime,
	desc: ScheduleDescriptor,
	time: TimeOfDay,
): Temporal.ZonedDateTime {
	// overflow: 'constrain' clamps invalid days (e.g. Feb 31 → Feb 28)
	return monthRef.with(
		{
			day: monthlyDay(monthRef, desc),
			hour: time.hour,
			minute: time.minute,
			second: 0,
			millisecond: 0,
		},
		{ overflow: "constrain" },
	);
}

// Resolve the day-of-month for the month of `monthRef`.
function monthlyDay(
	monthRef: Temporal.ZonedDateTime,
	desc: ScheduleDescriptor,
): number {
	if (desc.lastDayOfMonth) return monthRef.daysInMonth;
	if (desc.nthWeekday) return nthWeekdayOfMonth(monthRef, desc.nthWeekday);
	return desc.atDay ?? 1;
}

// Day-of-month for the nth (or last) occurrence of a weekday within monthRef's month.
function nthWeekdayOfMonth(
	monthRef: Temporal.ZonedDateTime,
	nth: { ordinal: Ordinal; weekday: Weekday },
): number {
	const targetDow = TEMPORAL_WEEKDAY[nth.weekday];
	const daysInMonth = monthRef.daysInMonth;

	if (nth.ordinal === "last") {
		const lastDow = monthRef.with({ day: daysInMonth }).dayOfWeek;
		const diff = (lastDow - targetDow + 7) % 7;
		return daysInMonth - diff;
	}

	const firstDow = monthRef.with({ day: 1 }).dayOfWeek;
	const offset = (targetDow - firstDow + 7) % 7;
	// first–fourth always exist (≤ day 28)
	return 1 + offset + 7 * ORDINAL_INDEX[nth.ordinal];
}

function computeNextYear(
	desc: ScheduleDescriptor,
	from: Temporal.ZonedDateTime,
): Temporal.ZonedDateTime {
	return earliest(timesOf(desc).map((t) => nextForYear(desc, from, t)));
}

function nextForYear(
	desc: ScheduleDescriptor,
	from: Temporal.ZonedDateTime,
	time: TimeOfDay,
): Temporal.ZonedDateTime {
	const fields = {
		month: desc.atMonth ?? 1,
		day: desc.atDay ?? 1,
		hour: time.hour,
		minute: time.minute,
		second: 0,
		millisecond: 0,
	};
	let candidate = from.with(fields, { overflow: "constrain" });

	if (Temporal.ZonedDateTime.compare(candidate, from) <= 0) {
		candidate = from
			.add({ years: desc.every })
			.with(fields, { overflow: "constrain" });
	}

	return candidate;
}
