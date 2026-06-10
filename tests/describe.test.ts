import { describe, expect, it } from "vitest";
import { describeSchedule } from "../src/describe.js";

describe("describeSchedule", () => {
	it("seconds / minutes / hours", () => {
		expect(describeSchedule({ every: 1, unit: "second" })).toBe("every second");
		expect(describeSchedule({ every: 5, unit: "minute" })).toBe(
			"every 5 minutes",
		);
		expect(describeSchedule({ every: 2, unit: "hour", atMinute: 15 })).toBe(
			"every 2 hours at minute :15",
		);
	});

	it("daily with a single time", () => {
		expect(
			describeSchedule({ every: 1, unit: "day", atHour: 8, atMinute: 30 }),
		).toBe("every day at 08:30");
	});

	it("daily with multiple times", () => {
		expect(
			describeSchedule({
				every: 1,
				unit: "day",
				atTimes: [
					{ hour: 9, minute: 0 },
					{ hour: 17, minute: 0 },
				],
			}),
		).toBe("every day at 09:00, 17:00");
	});

	it("named weekday / weekdays / weekends", () => {
		expect(
			describeSchedule({
				every: 1,
				unit: "week",
				weekdays: ["monday"],
				atHour: 9,
			}),
		).toBe("every Monday at 09:00");
		expect(
			describeSchedule({
				every: 1,
				unit: "week",
				weekdays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
				atHour: 9,
			}),
		).toBe("every weekday at 09:00");
		expect(
			describeSchedule({
				every: 1,
				unit: "week",
				weekdays: ["saturday", "sunday"],
				atHour: 10,
			}),
		).toBe("every weekend at 10:00");
		expect(
			describeSchedule({ every: 2, unit: "week", weekdays: ["friday"] }),
		).toBe("every 2 weeks on Friday at 00:00");
	});

	it("monthly variants", () => {
		expect(
			describeSchedule({ every: 1, unit: "month", atDay: 15, atHour: 9 }),
		).toBe("every month on day 15 at 09:00");
		expect(
			describeSchedule({ every: 1, unit: "month", lastDayOfMonth: true }),
		).toBe("every month on the last day at 00:00");
		expect(
			describeSchedule({
				every: 1,
				unit: "month",
				nthWeekday: { ordinal: "last", weekday: "friday" },
			}),
		).toBe("every month on the last Friday at 00:00");
	});

	it("yearly", () => {
		expect(
			describeSchedule({
				every: 1,
				unit: "year",
				atMonth: 3,
				atDay: 15,
				atHour: 10,
			}),
		).toBe("every year on 03-15 at 10:00");
	});

	it("appends timezone, bounds and times()", () => {
		expect(
			describeSchedule({
				every: 1,
				unit: "day",
				atHour: 9,
				timezone: "Europe/Berlin",
			}),
		).toBe("every day at 09:00 (Europe/Berlin)");
		expect(
			describeSchedule({
				every: 1,
				unit: "day",
				atHour: 9,
				timezone: "UTC",
				notBeforeMs: Date.parse("2025-07-01T00:00:00Z"),
			}),
		).toContain("from 2025-07-01T00:00:00");
		// Bound is rendered in the schedule's timezone, not UTC
		expect(
			describeSchedule({
				every: 1,
				unit: "day",
				atHour: 9,
				timezone: "Europe/Berlin",
				notBeforeMs: Date.parse("2025-07-01T00:00:00Z"),
			}),
		).toContain("from 2025-07-01T02:00:00"); // +02:00 in July
		expect(
			describeSchedule({ every: 1, unit: "day", atHour: 9, maxRuns: 3 }),
		).toContain(", 3 times");
	});
});
