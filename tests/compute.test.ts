import { describe, expect, it } from "vitest";
import { computeNextRun } from "../src/compute.js";
import type { ScheduleDescriptor } from "../src/types.js";

// Build a ZonedDateTime from an ISO instant string in a given timezone
function zdt(iso: string, tz = "UTC"): Temporal.ZonedDateTime {
	return Temporal.Instant.from(iso).toZonedDateTimeISO(tz);
}

// Compare two ZDTs by their absolute epoch milliseconds
function epochMs(z: Temporal.ZonedDateTime): number {
	return z.toInstant().epochMilliseconds;
}

describe("computeNextRun", () => {
	describe("seconds", () => {
		it("adds the interval in milliseconds", () => {
			const from = zdt("2025-01-06T12:00:00.000Z");
			const result = computeNextRun({ every: 30, unit: "second" }, from);
			expect(epochMs(result)).toBe(epochMs(zdt("2025-01-06T12:00:30.000Z")));
		});

		it("every 1 second", () => {
			const from = zdt("2025-01-06T12:00:00.500Z");
			const result = computeNextRun({ every: 1, unit: "second" }, from);
			expect(epochMs(result)).toBe(epochMs(zdt("2025-01-06T12:00:01.500Z")));
		});
	});

	describe("minutes", () => {
		it("every 5 minutes from 12:03 → 12:08", () => {
			const from = zdt("2025-01-06T12:03:00.000Z");
			const result = computeNextRun({ every: 5, unit: "minute" }, from);
			expect(epochMs(result)).toBe(epochMs(zdt("2025-01-06T12:08:00.000Z")));
		});

		it("every 1 minute", () => {
			const from = zdt("2025-01-06T12:00:45.000Z");
			const result = computeNextRun({ every: 1, unit: "minute" }, from);
			expect(epochMs(result)).toBe(epochMs(zdt("2025-01-06T12:01:45.000Z")));
		});
	});

	describe("hours", () => {
		it("every hour at :15, from 12:03 → 12:15", () => {
			const from = zdt("2025-01-06T12:03:00.000Z");
			const result = computeNextRun(
				{ every: 1, unit: "hour", atMinute: 15 },
				from,
			);
			expect(result.minute).toBe(15);
			expect(epochMs(result)).toBeGreaterThan(epochMs(from));
		});

		it("every hour at :15, from 12:16 → 13:15", () => {
			const from = zdt("2025-01-06T12:16:00.000Z");
			const result = computeNextRun(
				{ every: 1, unit: "hour", atMinute: 15 },
				from,
			);
			expect(result.minute).toBe(15);
			expect(result.hour).toBe(13);
			expect(epochMs(result)).toBeGreaterThan(epochMs(from));
		});

		it("every hour with no atMinute defaults to :00", () => {
			const from = zdt("2025-01-06T12:30:00.000Z");
			const result = computeNextRun({ every: 1, unit: "hour" }, from);
			expect(result.minute).toBe(0);
		});
	});

	describe("days", () => {
		it("every day at 08:30, from 07:00 same day → 08:30 today", () => {
			const from = zdt("2025-01-06T07:00:00.000Z");
			const desc: ScheduleDescriptor = {
				every: 1,
				unit: "day",
				atHour: 8,
				atMinute: 30,
			};
			const result = computeNextRun(desc, from);
			expect(result.hour).toBe(8);
			expect(result.minute).toBe(30);
			expect(result.day).toBe(6);
		});

		it("every day at 08:30, from 09:00 same day → 08:30 tomorrow", () => {
			const from = zdt("2025-01-06T09:00:00.000Z");
			const desc: ScheduleDescriptor = {
				every: 1,
				unit: "day",
				atHour: 8,
				atMinute: 30,
			};
			const result = computeNextRun(desc, from);
			expect(result.hour).toBe(8);
			expect(result.minute).toBe(30);
			expect(result.day).toBe(7);
		});

		it("every day defaults to midnight", () => {
			const from = zdt("2025-01-06T01:00:00.000Z");
			const desc: ScheduleDescriptor = { every: 1, unit: "day" };
			const result = computeNextRun(desc, from);
			expect(result.hour).toBe(0);
			expect(result.minute).toBe(0);
			expect(result.day).toBe(7);
		});
	});

	describe("weeks", () => {
		it("every monday at 09:00, from Tuesday → next Monday 09:00", () => {
			// 2025-01-07 is a Tuesday
			const from = zdt("2025-01-07T10:00:00.000Z");
			const desc: ScheduleDescriptor = {
				every: 1,
				unit: "week",
				weekday: "monday",
				atHour: 9,
				atMinute: 0,
			};
			const result = computeNextRun(desc, from);
			expect(result.dayOfWeek).toBe(1); // Monday
			expect(result.hour).toBe(9);
			expect(epochMs(result)).toBeGreaterThan(epochMs(from));
		});

		it("every monday at 09:00, from Monday before 09:00 → same day", () => {
			// 2025-01-06 is a Monday
			const from = zdt("2025-01-06T08:00:00.000Z");
			const desc: ScheduleDescriptor = {
				every: 1,
				unit: "week",
				weekday: "monday",
				atHour: 9,
				atMinute: 0,
			};
			const result = computeNextRun(desc, from);
			expect(result.dayOfWeek).toBe(1);
			expect(result.day).toBe(6);
		});

		it("every monday at 09:00, from Monday after 09:00 → next week", () => {
			// 2025-01-06 is a Monday
			const from = zdt("2025-01-06T10:00:00.000Z");
			const desc: ScheduleDescriptor = {
				every: 1,
				unit: "week",
				weekday: "monday",
				atHour: 9,
				atMinute: 0,
			};
			const result = computeNextRun(desc, from);
			expect(result.dayOfWeek).toBe(1);
			expect(result.day).toBe(13); // next Monday
		});
	});

	describe("months", () => {
		it("every month, 1st already past → 1st of next month", () => {
			const from = zdt("2025-01-06T10:00:00.000Z");
			const desc: ScheduleDescriptor = { every: 1, unit: "month" };
			const result = computeNextRun(desc, from);
			expect(result.month).toBe(2); // February (1-indexed)
			expect(result.day).toBe(1);
		});

		it("every month on the 15th, from the 10th → 15th this month", () => {
			const from = zdt("2025-01-10T00:00:00.000Z");
			const desc: ScheduleDescriptor = { every: 1, unit: "month", atDay: 15 };
			const result = computeNextRun(desc, from);
			expect(result.month).toBe(1); // January
			expect(result.day).toBe(15);
		});

		it("every month on the 15th, from the 20th → 15th next month", () => {
			const from = zdt("2025-01-20T00:00:00.000Z");
			const desc: ScheduleDescriptor = { every: 1, unit: "month", atDay: 15 };
			const result = computeNextRun(desc, from);
			expect(result.month).toBe(2); // February
			expect(result.day).toBe(15);
		});

		it("every month on the 15th at 09:00, from the 15th at 08:00 → same day", () => {
			const from = zdt("2025-01-15T08:00:00.000Z");
			const desc: ScheduleDescriptor = {
				every: 1,
				unit: "month",
				atDay: 15,
				atHour: 9,
				atMinute: 0,
			};
			const result = computeNextRun(desc, from);
			expect(result.month).toBe(1);
			expect(result.day).toBe(15);
			expect(result.hour).toBe(9);
		});

		it("clamps day 31 in February to 28", () => {
			// Start from Feb 1 so the next "day 31" is Feb 28 (clamped)
			const from = zdt("2025-02-01T00:00:00.000Z");
			const desc: ScheduleDescriptor = { every: 1, unit: "month", atDay: 31 };
			const result = computeNextRun(desc, from);
			expect(result.month).toBe(2); // February
			expect(result.day).toBe(28); // 2025 is not a leap year
		});

		it("every 2 months on the 1st", () => {
			const from = zdt("2025-01-20T00:00:00.000Z");
			const desc: ScheduleDescriptor = { every: 2, unit: "month", atDay: 1 };
			const result = computeNextRun(desc, from);
			expect(result.month).toBe(3); // March
			expect(result.day).toBe(1);
		});
	});

	describe("years", () => {
		it("every year, Jan 1 already past → Jan 1 next year", () => {
			const from = zdt("2025-01-05T00:00:00.000Z");
			const desc: ScheduleDescriptor = { every: 1, unit: "year" };
			const result = computeNextRun(desc, from);
			expect(result.year).toBe(2026);
			expect(result.month).toBe(1);
			expect(result.day).toBe(1);
		});

		it("every year on March 15, from Jan 2025 → March 2025", () => {
			const from = zdt("2025-01-10T00:00:00.000Z");
			const desc: ScheduleDescriptor = {
				every: 1,
				unit: "year",
				atMonth: 3,
				atDay: 15,
			};
			const result = computeNextRun(desc, from);
			expect(result.year).toBe(2025);
			expect(result.month).toBe(3); // March
			expect(result.day).toBe(15);
		});

		it("every year on March 15, from April 2025 → March 2026", () => {
			const from = zdt("2025-04-01T00:00:00.000Z");
			const desc: ScheduleDescriptor = {
				every: 1,
				unit: "year",
				atMonth: 3,
				atDay: 15,
			};
			const result = computeNextRun(desc, from);
			expect(result.year).toBe(2026);
			expect(result.month).toBe(3);
			expect(result.day).toBe(15);
		});

		it("clamps Feb 29 to Feb 28 in non-leap years", () => {
			const from = zdt("2024-03-01T00:00:00.000Z");
			const desc: ScheduleDescriptor = {
				every: 1,
				unit: "year",
				atMonth: 2,
				atDay: 29,
			};
			const result = computeNextRun(desc, from);
			expect(result.year).toBe(2025);
			expect(result.month).toBe(2); // February
			expect(result.day).toBe(28);
		});
	});

	describe("timezone support", () => {
		it("every day at 08:30 in Europe/Berlin fires at the correct UTC instant", () => {
			// In January, Berlin is UTC+1 → 08:30 local = 07:30 UTC
			const from = zdt("2025-01-06T07:00:00.000Z", "Europe/Berlin");
			const desc: ScheduleDescriptor = {
				every: 1,
				unit: "day",
				atHour: 8,
				atMinute: 30,
				timezone: "Europe/Berlin",
			};
			const result = computeNextRun(desc, from);
			// 08:30 Berlin (UTC+1) = 07:30 UTC
			expect(result.hour).toBe(8); // local Berlin hour
			expect(result.minute).toBe(30);
			expect(result.timeZoneId).toBe("Europe/Berlin");
			// epoch: Jan 6 07:30 UTC
			const expectedUtc = Temporal.Instant.from("2025-01-06T07:30:00Z");
			expect(result.toInstant().epochMilliseconds).toBe(
				expectedUtc.epochMilliseconds,
			);
		});

		it("every day at 08:30 in America/New_York fires at correct UTC instant", () => {
			// In January, New York is UTC-5 → 08:30 local = 13:30 UTC
			const from = zdt("2025-01-06T12:00:00.000Z", "America/New_York");
			const desc: ScheduleDescriptor = {
				every: 1,
				unit: "day",
				atHour: 8,
				atMinute: 30,
			};
			const result = computeNextRun(desc, from);
			expect(result.hour).toBe(8);
			expect(result.minute).toBe(30);
			const expectedUtc = Temporal.Instant.from("2025-01-06T13:30:00Z");
			expect(result.toInstant().epochMilliseconds).toBe(
				expectedUtc.epochMilliseconds,
			);
		});

		it("two schedules in different timezones fire at different UTC instants", () => {
			const fromUtc = zdt("2025-01-06T00:00:00.000Z", "UTC");
			const fromBerlin = zdt("2025-01-06T00:00:00.000Z", "Europe/Berlin");
			const desc: ScheduleDescriptor = {
				every: 1,
				unit: "day",
				atHour: 8,
				atMinute: 0,
			};

			const resultUtc = computeNextRun(desc, fromUtc);
			const resultBerlin = computeNextRun(desc, fromBerlin);

			// UTC 08:00 vs Berlin 08:00 (= UTC 07:00 in January)
			expect(resultUtc.toInstant().epochMilliseconds).toBeGreaterThan(
				resultBerlin.toInstant().epochMilliseconds,
			);
		});
	});
});
