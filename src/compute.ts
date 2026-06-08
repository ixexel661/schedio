import type { ScheduleDescriptor, Weekday } from "./types.js";

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

export function computeNextRun(
	desc: ScheduleDescriptor,
	from: Temporal.ZonedDateTime,
): Temporal.ZonedDateTime {
	switch (desc.unit) {
		case "second":
			return from.add({ seconds: desc.every });
		case "minute":
			return from.add({ minutes: desc.every });
		case "hour":
			return computeNextHour(desc, from);
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

function computeNextHour(
	desc: ScheduleDescriptor,
	from: Temporal.ZonedDateTime,
): Temporal.ZonedDateTime {
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
	const atHour = desc.atHour ?? 0;
	const atMinute = desc.atMinute ?? 0;
	let candidate = from.with({
		hour: atHour,
		minute: atMinute,
		second: 0,
		millisecond: 0,
	});

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

	return candidate;
}

function computeNextWeek(
	desc: ScheduleDescriptor,
	from: Temporal.ZonedDateTime,
): Temporal.ZonedDateTime {
	const atHour = desc.atHour ?? 0;
	const atMinute = desc.atMinute ?? 0;
	let candidate = from.with({
		hour: atHour,
		minute: atMinute,
		second: 0,
		millisecond: 0,
	});

	const targetDayOfWeek =
		desc.weekday != null ? TEMPORAL_WEEKDAY[desc.weekday] : candidate.dayOfWeek;
	const daysUntilTarget = (targetDayOfWeek - candidate.dayOfWeek + 7) % 7;
	candidate = candidate.add({ days: daysUntilTarget });

	if (Temporal.ZonedDateTime.compare(candidate, from) <= 0) {
		candidate = candidate.add({ weeks: desc.every });
	}

	if (desc.every > 1 && desc.weekday != null) {
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

	return candidate;
}

function computeNextMonth(
	desc: ScheduleDescriptor,
	from: Temporal.ZonedDateTime,
): Temporal.ZonedDateTime {
	const atDay = desc.atDay ?? 1;
	const atHour = desc.atHour ?? 0;
	const atMinute = desc.atMinute ?? 0;

	// overflow: 'constrain' clamps invalid days (e.g. Feb 31 → Feb 28)
	const fields = {
		day: atDay,
		hour: atHour,
		minute: atMinute,
		second: 0,
		millisecond: 0,
	};
	let candidate = from.with(fields, { overflow: "constrain" });

	if (Temporal.ZonedDateTime.compare(candidate, from) <= 0) {
		candidate = from
			.add({ months: desc.every })
			.with(fields, { overflow: "constrain" });
	}

	return candidate;
}

function computeNextYear(
	desc: ScheduleDescriptor,
	from: Temporal.ZonedDateTime,
): Temporal.ZonedDateTime {
	const atMonth = desc.atMonth ?? 1;
	const atDay = desc.atDay ?? 1;
	const atHour = desc.atHour ?? 0;
	const atMinute = desc.atMinute ?? 0;

	const fields = {
		month: atMonth,
		day: atDay,
		hour: atHour,
		minute: atMinute,
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
