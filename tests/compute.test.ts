import { describe, expect, it } from "vitest";
import { computeNextRun } from "../src/compute.js";
import type { ScheduleDescriptor } from "../src/types.js";

function d(iso: string): Date {
	return new Date(iso);
}

describe("computeNextRun", () => {
	describe("seconds", () => {
		it("adds the interval in milliseconds", () => {
			const from = d("2025-01-06T12:00:00.000Z");
			const result = computeNextRun({ every: 30, unit: "second" }, from);
			expect(result).toEqual(d("2025-01-06T12:00:30.000Z"));
		});

		it("every 1 second", () => {
			const from = d("2025-01-06T12:00:00.500Z");
			const result = computeNextRun({ every: 1, unit: "second" }, from);
			expect(result).toEqual(d("2025-01-06T12:00:01.500Z"));
		});
	});

	describe("minutes", () => {
		it("every 5 minutes from 12:03 → 12:08", () => {
			const from = d("2025-01-06T12:03:00.000Z");
			const result = computeNextRun({ every: 5, unit: "minute" }, from);
			expect(result).toEqual(d("2025-01-06T12:08:00.000Z"));
		});

		it("every 1 minute", () => {
			const from = d("2025-01-06T12:00:45.000Z");
			const result = computeNextRun({ every: 1, unit: "minute" }, from);
			expect(result).toEqual(d("2025-01-06T12:01:45.000Z"));
		});
	});

	describe("hours", () => {
		it("every hour at :15, from 12:03 → 12:15", () => {
			const from = d("2025-01-06T12:03:00.000Z");
			const result = computeNextRun(
				{ every: 1, unit: "hour", atMinute: 15 },
				from,
			);
			expect(result.getMinutes()).toBe(15);
			expect(result.getTime()).toBeGreaterThan(from.getTime());
		});

		it("every hour at :15, from 12:16 → next :15", () => {
			const from = d("2025-01-06T12:16:00.000Z");
			const result = computeNextRun(
				{ every: 1, unit: "hour", atMinute: 15 },
				from,
			);
			expect(result.getMinutes()).toBe(15);
			expect(result.getTime()).toBeGreaterThan(from.getTime());
			// Should be in the 13:xx range
			expect(result.getUTCHours()).toBe(13);
		});

		it("every hour with no atMinute defaults to :00", () => {
			const from = d("2025-01-06T12:30:00.000Z");
			const result = computeNextRun({ every: 1, unit: "hour" }, from);
			expect(result.getMinutes()).toBe(0);
		});
	});

	describe("days", () => {
		it("every day at 08:30, from 07:00 same day → 08:30 today", () => {
			const from = new Date("2025-01-06T07:00:00.000");
			const desc: ScheduleDescriptor = {
				every: 1,
				unit: "day",
				atHour: 8,
				atMinute: 30,
			};
			const result = computeNextRun(desc, from);
			expect(result.getHours()).toBe(8);
			expect(result.getMinutes()).toBe(30);
			expect(result.getDate()).toBe(from.getDate());
		});

		it("every day at 08:30, from 09:00 same day → 08:30 tomorrow", () => {
			const from = new Date("2025-01-06T09:00:00.000");
			const desc: ScheduleDescriptor = {
				every: 1,
				unit: "day",
				atHour: 8,
				atMinute: 30,
			};
			const result = computeNextRun(desc, from);
			expect(result.getHours()).toBe(8);
			expect(result.getMinutes()).toBe(30);
			expect(result.getDate()).toBe(from.getDate() + 1);
		});

		it("every day defaults to midnight", () => {
			const from = new Date("2025-01-06T01:00:00.000");
			const desc: ScheduleDescriptor = { every: 1, unit: "day" };
			const result = computeNextRun(desc, from);
			expect(result.getHours()).toBe(0);
			expect(result.getMinutes()).toBe(0);
			expect(result.getDate()).toBe(from.getDate() + 1);
		});
	});

	describe("weeks", () => {
		it("every monday at 09:00, from Tuesday → next Monday 09:00", () => {
			// 2025-01-07 is a Tuesday
			const from = new Date("2025-01-07T10:00:00.000");
			const desc: ScheduleDescriptor = {
				every: 1,
				unit: "week",
				weekday: "monday",
				atHour: 9,
				atMinute: 0,
			};
			const result = computeNextRun(desc, from);
			expect(result.getDay()).toBe(1); // Monday
			expect(result.getHours()).toBe(9);
			expect(result.getMinutes()).toBe(0);
			expect(result.getTime()).toBeGreaterThan(from.getTime());
		});

		it("every monday at 09:00, from Monday before 09:00 → same day", () => {
			// 2025-01-06 is a Monday
			const from = new Date("2025-01-06T08:00:00.000");
			const desc: ScheduleDescriptor = {
				every: 1,
				unit: "week",
				weekday: "monday",
				atHour: 9,
				atMinute: 0,
			};
			const result = computeNextRun(desc, from);
			expect(result.getDay()).toBe(1);
			expect(result.getDate()).toBe(6);
		});

		it("every monday at 09:00, from Monday after 09:00 → next week", () => {
			// 2025-01-06 is a Monday
			const from = new Date("2025-01-06T10:00:00.000");
			const desc: ScheduleDescriptor = {
				every: 1,
				unit: "week",
				weekday: "monday",
				atHour: 9,
				atMinute: 0,
			};
			const result = computeNextRun(desc, from);
			expect(result.getDay()).toBe(1);
			expect(result.getDate()).toBe(13); // next Monday
		});
	});

	describe("months", () => {
		it("every month, from before the 1st → 1st of current month", () => {
			const from = new Date("2025-01-06T10:00:00.000");
			const desc: ScheduleDescriptor = { every: 1, unit: "month" };
			const result = computeNextRun(desc, from);
			// Day defaults to 1; current month's 1st is already past → next month's 1st
			expect(result.getMonth()).toBe(1); // February
			expect(result.getDate()).toBe(1);
		});

		it("every month on the 15th, from the 10th → 15th this month", () => {
			const from = new Date("2025-01-10T00:00:00.000");
			const desc: ScheduleDescriptor = { every: 1, unit: "month", atDay: 15 };
			const result = computeNextRun(desc, from);
			expect(result.getMonth()).toBe(0); // January
			expect(result.getDate()).toBe(15);
		});

		it("every month on the 15th, from the 20th → 15th next month", () => {
			const from = new Date("2025-01-20T00:00:00.000");
			const desc: ScheduleDescriptor = { every: 1, unit: "month", atDay: 15 };
			const result = computeNextRun(desc, from);
			expect(result.getMonth()).toBe(1); // February
			expect(result.getDate()).toBe(15);
		});

		it("every month on the 15th at 09:00, from the 15th at 08:00 → same day", () => {
			const from = new Date("2025-01-15T08:00:00.000");
			const desc: ScheduleDescriptor = {
				every: 1,
				unit: "month",
				atDay: 15,
				atHour: 9,
				atMinute: 0,
			};
			const result = computeNextRun(desc, from);
			expect(result.getMonth()).toBe(0);
			expect(result.getDate()).toBe(15);
			expect(result.getHours()).toBe(9);
		});

		it("clamps day 31 in February to 28", () => {
			// Start from Feb 1 so the next "day 31" occurrence is Feb 28 (clamped)
			const from = new Date("2025-02-01T00:00:00.000");
			const desc: ScheduleDescriptor = { every: 1, unit: "month", atDay: 31 };
			const result = computeNextRun(desc, from);
			expect(result.getMonth()).toBe(1); // February
			expect(result.getDate()).toBe(28); // 2025 is not a leap year
		});

		it("every 2 months on the 1st", () => {
			const from = new Date("2025-01-20T00:00:00.000");
			const desc: ScheduleDescriptor = { every: 2, unit: "month", atDay: 1 };
			const result = computeNextRun(desc, from);
			expect(result.getMonth()).toBe(2); // March
			expect(result.getDate()).toBe(1);
		});
	});

	describe("years", () => {
		it("every year, from Jan 5 → Jan 1 next year (default)", () => {
			const from = new Date("2025-01-05T00:00:00.000");
			const desc: ScheduleDescriptor = { every: 1, unit: "year" };
			// default is Jan 1, which is already past → next year
			const result = computeNextRun(desc, from);
			expect(result.getFullYear()).toBe(2026);
			expect(result.getMonth()).toBe(0);
			expect(result.getDate()).toBe(1);
		});

		it("every year on March 15, from Jan 2025 → March 2025", () => {
			const from = new Date("2025-01-10T00:00:00.000");
			const desc: ScheduleDescriptor = {
				every: 1,
				unit: "year",
				atMonth: 3,
				atDay: 15,
			};
			const result = computeNextRun(desc, from);
			expect(result.getFullYear()).toBe(2025);
			expect(result.getMonth()).toBe(2); // March (0-indexed)
			expect(result.getDate()).toBe(15);
		});

		it("every year on March 15, from April 2025 → March 2026", () => {
			const from = new Date("2025-04-01T00:00:00.000");
			const desc: ScheduleDescriptor = {
				every: 1,
				unit: "year",
				atMonth: 3,
				atDay: 15,
			};
			const result = computeNextRun(desc, from);
			expect(result.getFullYear()).toBe(2026);
			expect(result.getMonth()).toBe(2);
			expect(result.getDate()).toBe(15);
		});

		it("clamps Feb 29 to Feb 28 in non-leap years", () => {
			const from = new Date("2024-03-01T00:00:00.000");
			const desc: ScheduleDescriptor = {
				every: 1,
				unit: "year",
				atMonth: 2,
				atDay: 29,
			};
			const result = computeNextRun(desc, from);
			expect(result.getFullYear()).toBe(2025);
			expect(result.getMonth()).toBe(1); // February
			expect(result.getDate()).toBe(28);
		});
	});
});
