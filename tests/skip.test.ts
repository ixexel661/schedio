import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { schedule } from "../src/builder.js";
import { computeNextRun } from "../src/compute.js";
import type { ScheduleDescriptor } from "../src/types.js";

function zdt(iso: string, tz = "UTC"): Temporal.ZonedDateTime {
	return Temporal.Instant.from(iso).toZonedDateTimeISO(tz);
}
function epochMs(z: Temporal.ZonedDateTime): number {
	return z.toInstant().epochMilliseconds;
}

const isWeekendUTC = (d: Date): boolean => {
	const day = d.getUTCDay();
	return day === 0 || day === 6;
};

describe(".skip() — compute", () => {
	it("skips candidates the predicate rejects (weekends → Monday)", () => {
		const desc: ScheduleDescriptor = {
			every: 1,
			unit: "day",
			atHour: 9,
			atMinute: 0,
			timezone: "UTC",
			skip: isWeekendUTC,
		};
		// Friday 2025-01-10 after 09:00 → skip Sat & Sun → Monday 2025-01-13 09:00
		const from = zdt("2025-01-10T10:00:00Z");
		expect(epochMs(computeNextRun(desc, from))).toBe(
			epochMs(zdt("2025-01-13T09:00:00Z")),
		);
	});

	it("throws when the filter rejects everything", () => {
		const desc: ScheduleDescriptor = {
			every: 1,
			unit: "day",
			atHour: 9,
			skip: () => true,
		};
		expect(() => computeNextRun(desc, zdt("2025-01-06T00:00:00Z"))).toThrow(
			RangeError,
		);
		expect(() => computeNextRun(desc, zdt("2025-01-06T00:00:00Z"))).toThrow(
			"infinite filter",
		);
	});
});

describe(".skip() — scheduler", () => {
	beforeEach(() =>
		vi.useFakeTimers({ now: new Date("2025-01-06T00:00:00.000Z") }),
	);
	afterEach(() => vi.useRealTimers());

	it("first-call exhaustion throws synchronously from run()", () => {
		expect(() =>
			schedule({ timezone: "UTC" })
				.every()
				.day()
				.at("09:00")
				.skip(() => true)
				.run(vi.fn()),
		).toThrow("infinite filter");
	});

	it("later exhaustion stops the schedule via onError", async () => {
		const onError = vi.fn();
		// runNow defers the first scheduleNext into fire() (the non-rethrow path)
		const h = schedule({ timezone: "UTC" })
			.every()
			.day()
			.at("09:00")
			.runNow()
			.skip(() => true)
			.run(vi.fn(), { onError });

		await vi.advanceTimersByTimeAsync(0); // flush the runNow fire + reschedule
		expect(onError).toHaveBeenCalledOnce();
		expect((onError.mock.calls[0]?.[0] as Error).message).toContain(
			"infinite filter",
		);
		expect(h.active).toBe(false);
	});
});
