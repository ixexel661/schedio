import type { ScheduleDescriptor, TimeOfDay, Weekday } from "./types.js";

/** The weekdays Monday–Friday, in order. */
export const WEEKDAYS: readonly Weekday[] = [
	"monday",
	"tuesday",
	"wednesday",
	"thursday",
	"friday",
];

/** The weekend days Saturday & Sunday. */
export const WEEKENDS: readonly Weekday[] = ["saturday", "sunday"];

/**
 * The configured times of day for a descriptor, defaulting to the single
 * `atHour`/`atMinute` (or midnight). Shared by compute and describe so the
 * scheduler and `toString()` always agree on when a schedule fires.
 */
export function timesOf(desc: ScheduleDescriptor): readonly TimeOfDay[] {
	if (desc.atTimes && desc.atTimes.length > 0) return desc.atTimes;
	return [{ hour: desc.atHour ?? 0, minute: desc.atMinute ?? 0 }];
}

/** Parse a single time argument (hour number or `"HH:MM"` string) into a TimeOfDay. */
export function parseTimeOfDay(time: string | number): TimeOfDay {
	if (typeof time === "number") return { hour: time, minute: 0 };
	const [h = "0", m = "0"] = time.split(":");
	return { hour: parseInt(h, 10), minute: parseInt(m, 10) };
}

/** Minutes since midnight for a time argument — used by `.between()`. */
export function timeToMinutes(time: string | number): number {
	const { hour, minute } = parseTimeOfDay(time);
	return hour * 60 + minute;
}
