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
		const epochDays = Math.floor(
			candidate.toInstant().epochMilliseconds / 86_400_000,
		);
		const remainder = epochDays % desc.every;
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
		desc.weekday != null ? TEMPORAL_WEEKDAY[desc.weekday] : from.dayOfWeek;
	const daysUntilTarget = (targetDayOfWeek - candidate.dayOfWeek + 7) % 7;
	candidate = candidate.add({ days: daysUntilTarget });

	if (Temporal.ZonedDateTime.compare(candidate, from) <= 0) {
		candidate = candidate.add({ weeks: desc.every });
	}

	if (desc.every > 1) {
		const epochWeeks = Math.floor(
			candidate.toInstant().epochMilliseconds / (7 * 86_400_000),
		);
		const remainder = epochWeeks % desc.every;
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
	let candidate = from.with(
		{ day: atDay, hour: atHour, minute: atMinute, second: 0, millisecond: 0 },
		{ overflow: "constrain" },
	);

	if (Temporal.ZonedDateTime.compare(candidate, from) <= 0) {
		candidate = from.add({ months: desc.every }).with(
			{
				day: atDay,
				hour: atHour,
				minute: atMinute,
				second: 0,
				millisecond: 0,
			},
			{ overflow: "constrain" },
		);
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

	let candidate = from.with(
		{
			month: atMonth,
			day: atDay,
			hour: atHour,
			minute: atMinute,
			second: 0,
			millisecond: 0,
		},
		{ overflow: "constrain" },
	);

	if (Temporal.ZonedDateTime.compare(candidate, from) <= 0) {
		candidate = from.add({ years: desc.every }).with(
			{
				month: atMonth,
				day: atDay,
				hour: atHour,
				minute: atMinute,
				second: 0,
				millisecond: 0,
			},
			{ overflow: "constrain" },
		);
	}

	return candidate;
}
