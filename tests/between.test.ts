import { describe, expect, it } from "vitest";
import { schedule } from "../src/builder.js";
import { computeNextRun } from "../src/compute.js";
import type { ScheduleDescriptor } from "../src/types.js";

function zdt(iso: string, tz = "UTC"): Temporal.ZonedDateTime {
	return Temporal.Instant.from(iso).toZonedDateTimeISO(tz);
}
function epochMs(z: Temporal.ZonedDateTime): number {
	return z.toInstant().epochMilliseconds;
}

const noop = (): void => {};

describe(".between() window — compute", () => {
	// every 30 minutes between 09:00 and 17:00
	const desc: ScheduleDescriptor = {
		every: 30,
		unit: "minute",
		windowStartMin: 9 * 60,
		windowEndMin: 17 * 60,
	};

	it("inside the window: normal interval", () => {
		const from = zdt("2025-01-06T10:00:00Z");
		expect(epochMs(computeNextRun(desc, from))).toBe(
			epochMs(zdt("2025-01-06T10:30:00Z")),
		);
	});

	it("before the window: snaps to today's window start", () => {
		const from = zdt("2025-01-06T07:10:00Z"); // +30 = 07:40, still before 09:00
		expect(epochMs(computeNextRun(desc, from))).toBe(
			epochMs(zdt("2025-01-06T09:00:00Z")),
		);
	});

	it("after the window close: snaps to next day's window start", () => {
		const from = zdt("2025-01-06T17:00:00Z"); // +30 = 17:30, past close
		expect(epochMs(computeNextRun(desc, from))).toBe(
			epochMs(zdt("2025-01-07T09:00:00Z")),
		);
	});

	it("last slot before close stays in the window", () => {
		const from = zdt("2025-01-06T16:00:00Z"); // +30 = 16:30 < 17:00
		expect(epochMs(computeNextRun(desc, from))).toBe(
			epochMs(zdt("2025-01-06T16:30:00Z")),
		);
	});

	it("a fire landing exactly on the close is excluded", () => {
		const from = zdt("2025-01-06T16:30:00Z"); // +30 = 17:00 == end (exclusive)
		expect(epochMs(computeNextRun(desc, from))).toBe(
			epochMs(zdt("2025-01-07T09:00:00Z")),
		);
	});

	it("every(2).hours() snaps into the window", () => {
		const d: ScheduleDescriptor = {
			every: 2,
			unit: "hour",
			atMinute: 0,
			windowStartMin: 9 * 60,
			windowEndMin: 17 * 60,
		};
		const r = computeNextRun(d, zdt("2025-01-06T06:30:00Z"));
		expect(r.hour).toBe(9);
		expect(r.minute).toBe(0);
	});

	it("hours().at(15) picks the first HH:15 at/after the window start", () => {
		const d: ScheduleDescriptor = {
			every: 1,
			unit: "hour",
			atMinute: 15,
			windowStartMin: 9 * 60,
			windowEndMin: 17 * 60,
		};
		const r = computeNextRun(d, zdt("2025-01-06T07:40:00Z")); // → 08:15, before window
		expect(r.hour).toBe(9);
		expect(r.minute).toBe(15);
	});

	it("every(30).seconds() excludes the exact close second", () => {
		const d: ScheduleDescriptor = {
			every: 30,
			unit: "second",
			windowStartMin: 9 * 60,
			windowEndMin: 17 * 60,
		};
		const from = zdt("2025-01-06T16:59:30Z"); // +30 = 17:00:00 == close
		expect(epochMs(computeNextRun(d, from))).toBe(
			epochMs(zdt("2025-01-07T09:00:00Z")),
		);
	});
});

describe(".between() — builder guard & describe", () => {
	it("throws on calendar units (day/week/month/year)", () => {
		expect(() => schedule().every().day().between("09:00", "17:00")).toThrow(
			RangeError,
		);
		expect(() => schedule().every().day().between("09:00", "17:00")).toThrow(
			"only applies to",
		);
	});

	it("allows second/minute/hour units", () => {
		const h = schedule()
			.every(30)
			.minutes()
			.between("09:00", "17:00")
			.run(noop);
		expect(h.active).toBe(true);
		h.stop();
	});

	it("describes the window", () => {
		expect(
			String(schedule().every(30).minutes().between("09:00", "17:00")),
		).toBe("every 30 minutes between 09:00 and 17:00");
	});
});
