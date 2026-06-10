import { describe, expect, it, vi } from "vitest";
import { schedule } from "../src/builder.js";

describe("builder chain — descriptor shape", () => {
	function capture(fn: () => ReturnType<typeof schedule>["every"]) {
		// We call .run() with a no-op and immediately stop so no timers fire
		const noop = vi.fn();
		const chain = fn() as unknown as {
			desc: object;
			run: (j: () => void) => { stop: () => void };
		};
		const handle = chain.run(noop);
		handle.stop();
		// Access the internal desc for assertion
		return (chain as unknown as { desc: object }).desc;
	}

	it("every(5).minutes()", () => {
		const desc = capture(() => schedule().every(5).minutes() as never);
		expect(desc).toMatchObject({ every: 5, unit: "minute" });
	});

	it("every().minutes() defaults to every=1", () => {
		const desc = capture(() => schedule().every().minutes() as never);
		expect(desc).toMatchObject({ every: 1, unit: "minute" });
	});

	it("every().hours().at(15)", () => {
		const desc = capture(() => schedule().every().hours().at(15) as never);
		expect(desc).toMatchObject({ every: 1, unit: "hour", atMinute: 15 });
	});

	it("every().hours() without .at()", () => {
		const desc = capture(() => schedule().every().hours() as never);
		expect(desc).toMatchObject({ every: 1, unit: "hour" });
	});

	it('every().days().at("08:30")', () => {
		const desc = capture(() => schedule().every().days().at("08:30") as never);
		expect(desc).toMatchObject({
			every: 1,
			unit: "day",
			atHour: 8,
			atMinute: 30,
		});
	});

	it("every().days().at(8) interprets number as hour", () => {
		const desc = capture(() => schedule().every().days().at(8) as never);
		expect(desc).toMatchObject({
			every: 1,
			unit: "day",
			atHour: 8,
			atMinute: 0,
		});
	});

	it('every().monday().at("09:00")', () => {
		const desc = capture(
			() => schedule().every().monday().at("09:00") as never,
		);
		expect(desc).toMatchObject({
			every: 1,
			unit: "week",
			weekdays: ["monday"],
			atHour: 9,
			atMinute: 0,
		});
	});

	it("every(2).weeks()", () => {
		const desc = capture(() => schedule().every(2).weeks() as never);
		expect(desc).toMatchObject({ every: 2, unit: "week" });
	});

	it("every().weeks().friday()", () => {
		const desc = capture(() => schedule().every().weeks().friday() as never);
		expect(desc).toMatchObject({
			every: 1,
			unit: "week",
			weekdays: ["friday"],
		});
	});

	it("every().seconds()", () => {
		const desc = capture(() => schedule().every().seconds() as never);
		expect(desc).toMatchObject({ every: 1, unit: "second" });
	});

	it("every().months()", () => {
		const desc = capture(() => schedule().every().months() as never);
		expect(desc).toMatchObject({ every: 1, unit: "month" });
	});

	it("every().months().on(15)", () => {
		const desc = capture(() => schedule().every().months().on(15) as never);
		expect(desc).toMatchObject({ every: 1, unit: "month", atDay: 15 });
	});

	it('every().months().on(15).at("09:00")', () => {
		const desc = capture(
			() => schedule().every().months().on(15).at("09:00") as never,
		);
		expect(desc).toMatchObject({
			every: 1,
			unit: "month",
			atDay: 15,
			atHour: 9,
			atMinute: 0,
		});
	});

	it("every(3).months()", () => {
		const desc = capture(() => schedule().every(3).months() as never);
		expect(desc).toMatchObject({ every: 3, unit: "month" });
	});

	it('every().days().at("09:00","17:00") sets atTimes', () => {
		const desc = capture(
			() => schedule().every().days().at("09:00", "17:00") as never,
		);
		expect(desc).toMatchObject({
			every: 1,
			unit: "day",
			atTimes: [
				{ hour: 9, minute: 0 },
				{ hour: 17, minute: 0 },
			],
		});
	});

	it('every().months().on("last") sets lastDayOfMonth', () => {
		const desc = capture(() => schedule().every().months().on("last") as never);
		expect(desc).toMatchObject({
			every: 1,
			unit: "month",
			lastDayOfMonth: true,
		});
	});

	it('every().months().on("last","friday") sets nthWeekday', () => {
		const desc = capture(
			() => schedule().every().months().on("last", "friday") as never,
		);
		expect(desc).toMatchObject({
			every: 1,
			unit: "month",
			nthWeekday: { ordinal: "last", weekday: "friday" },
		});
	});

	it("every().years()", () => {
		const desc = capture(() => schedule().every().years() as never);
		expect(desc).toMatchObject({ every: 1, unit: "year" });
	});

	it('every().years().on("03-15")', () => {
		const desc = capture(() => schedule().every().years().on("03-15") as never);
		expect(desc).toMatchObject({
			every: 1,
			unit: "year",
			atMonth: 3,
			atDay: 15,
		});
	});

	it('every().years().on("03-15").at("09:00")', () => {
		const desc = capture(
			() => schedule().every().years().on("03-15").at("09:00") as never,
		);
		expect(desc).toMatchObject({
			every: 1,
			unit: "year",
			atMonth: 3,
			atDay: 15,
			atHour: 9,
			atMinute: 0,
		});
	});
});

describe("builder — run() returns active JobHandle", () => {
	it("handle.active is true after start", () => {
		const handle = schedule()
			.every(30)
			.seconds()
			.run(() => {});
		expect(handle.active).toBe(true);
		handle.stop();
	});

	it("handle.active is false after stop()", () => {
		const handle = schedule()
			.every(30)
			.seconds()
			.run(() => {});
		handle.stop();
		expect(handle.active).toBe(false);
	});

	it("stop() is idempotent", () => {
		const handle = schedule()
			.every(30)
			.seconds()
			.run(() => {});
		handle.stop();
		expect(() => handle.stop()).not.toThrow();
	});
});
