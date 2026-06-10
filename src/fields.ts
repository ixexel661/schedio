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
