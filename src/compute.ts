import type { ScheduleDescriptor, Weekday } from "./types.js";

const MS = {
	second: 1_000,
	minute: 60_000,
	hour: 3_600_000,
	day: 86_400_000,
	week: 604_800_000,
} as const;

const WEEKDAY_INDEX: Record<Weekday, number> = {
	sunday: 0,
	monday: 1,
	tuesday: 2,
	wednesday: 3,
	thursday: 4,
	friday: 5,
	saturday: 6,
};

export function computeNextRun(desc: ScheduleDescriptor, from: Date): Date {
	switch (desc.unit) {
		case "second":
		case "minute":
			return new Date(from.getTime() + desc.every * MS[desc.unit]);

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

function computeNextHour(desc: ScheduleDescriptor, from: Date): Date {
	const atMinute = desc.atMinute ?? 0;

	// Start at the top of the current hour, then set the target minute
	const candidate = new Date(from);
	candidate.setMinutes(atMinute, 0, 0);

	// If the candidate is in the past, advance by one interval at a time
	if (candidate.getTime() <= from.getTime()) {
		candidate.setHours(candidate.getHours() + desc.every);
	}

	// Align to the `every` multiplier using hour-of-day epoch alignment
	if (desc.every > 1) {
		while (candidate.getHours() % desc.every !== 0) {
			candidate.setHours(candidate.getHours() + 1);
		}
	}

	return candidate;
}

function computeNextDay(desc: ScheduleDescriptor, from: Date): Date {
	const atHour = desc.atHour ?? 0;
	const atMinute = desc.atMinute ?? 0;

	const candidate = new Date(from);
	candidate.setHours(atHour, atMinute, 0, 0);

	if (candidate.getTime() <= from.getTime()) {
		candidate.setDate(candidate.getDate() + desc.every);
	}

	if (desc.every > 1) {
		// Align to multiples of `every` days from the Unix epoch (UTC day 0)
		const epochDays = Math.floor(candidate.getTime() / MS.day);
		const remainder = epochDays % desc.every;
		if (remainder !== 0) {
			candidate.setDate(candidate.getDate() + (desc.every - remainder));
		}
	}

	return candidate;
}

function daysInMonth(year: number, month: number): number {
	// month is 0-indexed; day 0 of the next month = last day of this month
	return new Date(year, month + 1, 0).getDate();
}

function clampDay(year: number, month: number, day: number): number {
	return Math.min(day, daysInMonth(year, month));
}

function computeNextMonth(desc: ScheduleDescriptor, from: Date): Date {
	const atDay = desc.atDay ?? 1;
	const atHour = desc.atHour ?? 0;
	const atMinute = desc.atMinute ?? 0;

	const candidate = new Date(from);
	candidate.setDate(1); // avoid overflow when setting month
	candidate.setMonth(from.getMonth());
	candidate.setDate(
		clampDay(candidate.getFullYear(), candidate.getMonth(), atDay),
	);
	candidate.setHours(atHour, atMinute, 0, 0);

	if (candidate.getTime() <= from.getTime()) {
		candidate.setDate(1);
		candidate.setMonth(candidate.getMonth() + desc.every);
		candidate.setDate(
			clampDay(candidate.getFullYear(), candidate.getMonth(), atDay),
		);
	}

	return candidate;
}

function computeNextYear(desc: ScheduleDescriptor, from: Date): Date {
	const atMonth = (desc.atMonth ?? 1) - 1; // convert to 0-indexed
	const atDay = desc.atDay ?? 1;
	const atHour = desc.atHour ?? 0;
	const atMinute = desc.atMinute ?? 0;

	const candidate = new Date(from);
	candidate.setMonth(atMonth, 1);
	candidate.setDate(clampDay(candidate.getFullYear(), atMonth, atDay));
	candidate.setHours(atHour, atMinute, 0, 0);

	if (candidate.getTime() <= from.getTime()) {
		candidate.setFullYear(candidate.getFullYear() + desc.every);
		candidate.setMonth(atMonth, 1);
		candidate.setDate(clampDay(candidate.getFullYear(), atMonth, atDay));
		candidate.setHours(atHour, atMinute, 0, 0);
	}

	return candidate;
}

function computeNextWeek(desc: ScheduleDescriptor, from: Date): Date {
	const atHour = desc.atHour ?? 0;
	const atMinute = desc.atMinute ?? 0;

	const candidate = new Date(from);
	candidate.setHours(atHour, atMinute, 0, 0);

	const targetDay =
		desc.weekday != null ? WEEKDAY_INDEX[desc.weekday] : from.getDay();
	const currentDay = candidate.getDay();
	const daysUntilTarget = (targetDay - currentDay + 7) % 7;

	candidate.setDate(candidate.getDate() + daysUntilTarget);

	if (candidate.getTime() <= from.getTime()) {
		candidate.setDate(candidate.getDate() + 7 * desc.every);
	}

	if (desc.every > 1) {
		const epochWeeks = Math.floor(candidate.getTime() / MS.week);
		const remainder = epochWeeks % desc.every;
		if (remainder !== 0) {
			candidate.setDate(candidate.getDate() + 7 * (desc.every - remainder));
		}
	}

	return candidate;
}
