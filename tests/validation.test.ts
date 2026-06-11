import { describe, expect, it } from "vitest";
import { schedule } from "../src/builder.js";

const noop = (): void => {};

describe("validation — every()", () => {
	it("accepts valid values", () => {
		expect(() => schedule().every(1).seconds().run(noop)).not.toThrow();
		expect(() => schedule().every(60).minutes().run(noop)).not.toThrow();
	});

	it("throws on 0", () => {
		expect(() => schedule().every(0).seconds().run(noop)).toThrow(RangeError);
		expect(() => schedule().every(0).seconds().run(noop)).toThrow(
			"schedio: every() expects a positive integer ≥ 1",
		);
	});

	it("throws on negative", () => {
		expect(() => schedule().every(-1).minutes().run(noop)).toThrow(RangeError);
	});

	it("throws on non-integer", () => {
		expect(() => schedule().every(1.5).hours().run(noop)).toThrow(RangeError);
	});
});

describe("validation — timezone", () => {
	it("accepts valid IANA timezones", () => {
		expect(() => schedule({ timezone: "Europe/Berlin" })).not.toThrow();
		expect(() => schedule({ timezone: "America/New_York" })).not.toThrow();
		expect(() => schedule({ timezone: "UTC" })).not.toThrow();
	});

	it("throws on invalid timezone", () => {
		expect(() => schedule({ timezone: "Mars/Olympus" })).toThrow(RangeError);
		expect(() => schedule({ timezone: "Mars/Olympus" })).toThrow("schedio:");
	});

	it("throws on empty string", () => {
		expect(() => schedule({ timezone: "" })).toThrow(RangeError);
	});
});

describe("validation — at() on AtMinuteStep (hours)", () => {
	it("accepts 0–59", () => {
		expect(() => schedule().every().hours().at(0).run(noop)).not.toThrow();
		expect(() => schedule().every().hours().at(59).run(noop)).not.toThrow();
	});

	it("throws on 60", () => {
		expect(() => schedule().every().hours().at(60).run(noop)).toThrow(
			RangeError,
		);
		expect(() => schedule().every().hours().at(60).run(noop)).toThrow(
			"schedio: at() expects a minute 0–59",
		);
	});

	it("throws on negative", () => {
		expect(() => schedule().every().hours().at(-1).run(noop)).toThrow(
			RangeError,
		);
	});
});

describe("validation — at() on AtTimeStep (days/weeks)", () => {
	it("accepts hour number 0–23", () => {
		expect(() => schedule().every().days().at(0).run(noop)).not.toThrow();
		expect(() => schedule().every().days().at(23).run(noop)).not.toThrow();
	});

	it("throws on hour 24", () => {
		expect(() => schedule().every().days().at(24).run(noop)).toThrow(
			RangeError,
		);
		expect(() => schedule().every().days().at(24).run(noop)).toThrow(
			"schedio: at() expects an hour 0–23",
		);
	});

	it("accepts valid time strings", () => {
		expect(() => schedule().every().days().at("00:00").run(noop)).not.toThrow();
		expect(() => schedule().every().days().at("23:59").run(noop)).not.toThrow();
		expect(() => schedule().every().days().at("8:30").run(noop)).not.toThrow();
	});

	it("throws on invalid time string", () => {
		expect(() => schedule().every().days().at("25:00").run(noop)).toThrow(
			RangeError,
		);
		expect(() => schedule().every().days().at("8:75").run(noop)).toThrow(
			RangeError,
		);
		expect(() => schedule().every().days().at("noon").run(noop)).toThrow(
			RangeError,
		);
	});
});

describe("validation — on() for months", () => {
	it("accepts 1–31", () => {
		expect(() => schedule().every().months().on(1).run(noop)).not.toThrow();
		expect(() => schedule().every().months().on(31).run(noop)).not.toThrow();
	});

	it("throws on 0 and 32", () => {
		expect(() => schedule().every().months().on(0).run(noop)).toThrow(
			RangeError,
		);
		expect(() => schedule().every().months().on(32).run(noop)).toThrow(
			RangeError,
		);
		expect(() => schedule().every().months().on(0).run(noop)).toThrow(
			"schedio: on() expects a day 1–31",
		);
	});
});

describe("validation — on() for years", () => {
	it("accepts valid MM-DD", () => {
		expect(() =>
			schedule().every().years().on("01-01").run(noop),
		).not.toThrow();
		expect(() =>
			schedule().every().years().on("12-31").run(noop),
		).not.toThrow();
	});

	it("throws on invalid month", () => {
		expect(() => schedule().every().years().on("00-15").run(noop)).toThrow(
			RangeError,
		);
		expect(() => schedule().every().years().on("13-15").run(noop)).toThrow(
			RangeError,
		);
	});

	it("throws on wrong format", () => {
		expect(() => schedule().every().years().on("1-1").run(noop)).toThrow(
			RangeError,
		);
		expect(() => schedule().every().years().on("March-15").run(noop)).toThrow(
			RangeError,
		);
	});
});

describe("validation — times()", () => {
	it("accepts positive integers", () => {
		expect(() =>
			schedule().every(1).minutes().times(1).run(noop),
		).not.toThrow();
	});

	it("throws on 0 and negative", () => {
		expect(() => schedule().every(1).minutes().times(0).run(noop)).toThrow(
			RangeError,
		);
		expect(() => schedule().every(1).minutes().times(-3).run(noop)).toThrow(
			RangeError,
		);
	});

	it("throws on non-integer", () => {
		expect(() => schedule().every(1).minutes().times(1.5).run(noop)).toThrow(
			RangeError,
		);
	});
});

describe("validation — jitter()", () => {
	it("accepts 0 and positive values", () => {
		expect(() =>
			schedule().every(1).minutes().jitter(0).run(noop),
		).not.toThrow();
		expect(() =>
			schedule().every(1).minutes().jitter(5000).run(noop),
		).not.toThrow();
	});

	it("throws on negative", () => {
		expect(() => schedule().every(1).minutes().jitter(-1).run(noop)).toThrow(
			RangeError,
		);
		expect(() => schedule().every(1).minutes().jitter(-1).run(noop)).toThrow(
			"schedio: jitter() expects a non-negative finite number",
		);
	});

	it("throws on Infinity", () => {
		expect(() =>
			schedule().every(1).minutes().jitter(Infinity).run(noop),
		).toThrow(RangeError);
		expect(() =>
			schedule().every(1).minutes().jitter(Infinity).run(noop),
		).toThrow("schedio: jitter() expects a non-negative finite number");
	});

	it("throws on NaN", () => {
		expect(() => schedule().every(1).minutes().jitter(NaN).run(noop)).toThrow(
			RangeError,
		);
	});
});

describe("validation — once().at()", () => {
	it("throws on unparseable string", () => {
		expect(() => schedule().once().at("not-a-date").run(noop)).toThrow(
			RangeError,
		);
		expect(() => schedule().once().at("not-a-date").run(noop)).toThrow(
			"schedio:",
		);
	});

	it("preserves original error as cause", () => {
		let caught: unknown;
		try {
			schedule().once().at("not-a-date").run(noop);
		} catch (e) {
			caught = e;
		}
		expect(caught).toBeInstanceOf(RangeError);
		expect((caught as RangeError & { cause?: unknown }).cause).toBeTruthy();
	});

	it("accepts valid ISO strings", () => {
		expect(() =>
			schedule().once().at("2030-01-01T00:00:00Z").run(noop),
		).not.toThrow();
	});
});

describe("validation — months().on() ordinals/weekdays", () => {
	it("on(ordinal) without a weekday throws a clear RangeError", () => {
		expect(() =>
			schedule()
				.every()
				.months()
				.on("first" as never)
				.run(noop),
		).toThrow(RangeError);
		expect(() =>
			schedule()
				.every()
				.months()
				.on("first" as never)
				.run(noop),
		).toThrow("requires a weekday");
	});

	it("on(ordinal, badWeekday) throws a RangeError", () => {
		expect(() =>
			schedule()
				.every()
				.months()
				.on("first", "funday" as never)
				.run(noop),
		).toThrow(RangeError);
		expect(() =>
			schedule()
				.every()
				.months()
				.on("first", "funday" as never)
				.run(noop),
		).toThrow("schedio:");
	});

	it("on(ordinal, weekday) is valid", () => {
		expect(() =>
			schedule().every().months().on("first", "monday").run(noop),
		).not.toThrow();
	});
});

describe("validation — between()", () => {
	it("throws when start >= end (overnight not supported)", () => {
		expect(() =>
			schedule().every(30).minutes().between("17:00", "09:00"),
		).toThrow(RangeError);
		expect(() =>
			schedule().every(30).minutes().between("17:00", "09:00"),
		).toThrow("overnight");
		expect(() =>
			schedule().every(30).minutes().between("09:00", "09:00"),
		).toThrow(RangeError);
	});

	it("throws on an invalid time", () => {
		expect(() =>
			schedule().every(30).minutes().between("noon", "17:00"),
		).toThrow(RangeError);
	});

	it("throws on calendar units", () => {
		expect(() => schedule().every().week().between("09:00", "17:00")).toThrow(
			"only applies to",
		);
	});
});

describe("validation — nextRuns()", () => {
	it("throws on 0, negative, and non-integer", () => {
		const h = schedule().every(1).minutes().run(noop);
		expect(() => h.nextRuns(0)).toThrow(RangeError);
		expect(() => h.nextRuns(-1)).toThrow(RangeError);
		expect(() => h.nextRuns(1.5)).toThrow(RangeError);
		h.stop();
	});
});

describe("validation — skip()", () => {
	it("throws when the argument is not a function", () => {
		expect(() =>
			schedule()
				.every(1)
				.minutes()
				.skip(123 as never),
		).toThrow(RangeError);
		expect(() =>
			schedule()
				.every(1)
				.minutes()
				.skip(123 as never),
		).toThrow("skip()");
	});
});
