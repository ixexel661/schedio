import { timesOf, WEEKDAYS, WEEKENDS } from "./fields.js";
import type { ScheduleDescriptor, TimeOfDay, Weekday } from "./types.js";

const WEEKDAY_LABEL: Record<Weekday, string> = {
	monday: "Monday",
	tuesday: "Tuesday",
	wednesday: "Wednesday",
	thursday: "Thursday",
	friday: "Friday",
	saturday: "Saturday",
	sunday: "Sunday",
};

function pad(n: number): string {
	return String(n).padStart(2, "0");
}

function formatTimes(times: readonly TimeOfDay[]): string {
	return times.map((t) => `${pad(t.hour)}:${pad(t.minute)}`).join(", ");
}

function interval(every: number, unit: string): string {
	return every === 1 ? `every ${unit}` : `every ${every} ${unit}s`;
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
	if (a.length !== b.length) return false;
	const set = new Set(a);
	return b.every((x) => set.has(x));
}

function describeWeek(desc: ScheduleDescriptor): string {
	const times = formatTimes(timesOf(desc));
	const days = desc.weekdays ?? [];
	if (days.length === 0) {
		return `${interval(desc.every, "week")} at ${times}`;
	}

	const isWeekdays = sameSet(days, WEEKDAYS);
	const isWeekends = sameSet(days, WEEKENDS);
	const names = days.map((d) => WEEKDAY_LABEL[d]).join(", ");

	if (desc.every === 1) {
		if (isWeekdays) return `every weekday at ${times}`;
		if (isWeekends) return `every weekend at ${times}`;
		return `every ${names} at ${times}`;
	}

	const label = isWeekdays ? "weekdays" : isWeekends ? "weekends" : names;
	return `every ${desc.every} weeks on ${label} at ${times}`;
}

function describeMonthDay(desc: ScheduleDescriptor): string {
	if (desc.lastDayOfMonth) return "the last day";
	if (desc.nthWeekday) {
		return `the ${desc.nthWeekday.ordinal} ${WEEKDAY_LABEL[desc.nthWeekday.weekday]}`;
	}
	return `day ${desc.atDay ?? 1}`;
}

/** Render a human-readable description of a schedule, e.g. `"every day at 08:30"`. */
export function describeSchedule(desc: ScheduleDescriptor): string {
	let s: string;
	switch (desc.unit) {
		case "second":
			s = interval(desc.every, "second");
			break;
		case "minute":
			s = interval(desc.every, "minute");
			break;
		case "hour":
			s = interval(desc.every, "hour");
			if (desc.atMinute != null) s += ` at minute :${pad(desc.atMinute)}`;
			break;
		case "day":
			s = `${interval(desc.every, "day")} at ${formatTimes(timesOf(desc))}`;
			break;
		case "week":
			s = describeWeek(desc);
			break;
		case "month":
			s = `${interval(desc.every, "month")} on ${describeMonthDay(desc)} at ${formatTimes(
				timesOf(desc),
			)}`;
			break;
		case "year":
			s = `${interval(desc.every, "year")} on ${pad(desc.atMonth ?? 1)}-${pad(
				desc.atDay ?? 1,
			)} at ${formatTimes(timesOf(desc))}`;
			break;
	}

	if (desc.timezone) s += ` (${desc.timezone})`;
	// Render bounds in the schedule's timezone so the line doesn't mix zones.
	const tz = desc.timezone ?? Temporal.Now.timeZoneId();
	const fmtBound = (ms: number): string =>
		Temporal.Instant.fromEpochMilliseconds(ms)
			.toZonedDateTimeISO(tz)
			.toPlainDateTime()
			.toString();
	if (desc.notBeforeMs != null) s += ` from ${fmtBound(desc.notBeforeMs)}`;
	if (desc.notAfterMs != null) s += ` until ${fmtBound(desc.notAfterMs)}`;
	if (desc.maxRuns != null) s += `, ${desc.maxRuns} times`;
	return s;
}
