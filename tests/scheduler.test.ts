import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { schedule } from "../src/builder.js";
import type { JobHandle } from "../src/types.js";

// Use a known Monday at midnight UTC
const FAKE_NOW = new Date("2025-01-06T00:00:00.000Z");

describe("scheduler — drift correction", () => {
	beforeEach(() => {
		vi.useFakeTimers({ now: FAKE_NOW });
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("every(1).seconds() fires on exact second boundaries despite job duration", async () => {
		const fires: number[] = [];
		// Job takes 200ms but should not shift subsequent firings
		const job = vi.fn(async () => {
			fires.push(Date.now());
			await vi.advanceTimersByTimeAsync(200);
		});

		const handle = schedule().every(1).seconds().run(job);

		// Advance 5 full seconds; each fire + job takes 1200ms in simulated time
		await vi.advanceTimersByTimeAsync(5_000);

		expect(fires.length).toBeGreaterThanOrEqual(4);
		// Each fire should be at a 1000ms multiple from epoch start, not drifted
		for (const fireMs of fires) {
			const offsetMs = fireMs - FAKE_NOW.getTime();
			expect(offsetMs % 1_000).toBe(0);
		}

		handle.stop();
	});

	it("every(1).minutes() fires on exact minute boundaries despite job duration", async () => {
		const fires: number[] = [];
		const job = vi.fn(async () => {
			fires.push(Date.now());
			await vi.advanceTimersByTimeAsync(5_000); // 5s job
		});

		const handle = schedule().every(1).minutes().run(job);

		await vi.advanceTimersByTimeAsync(3 * 60_000);

		expect(fires.length).toBeGreaterThanOrEqual(2);
		for (const fireMs of fires) {
			const offsetMs = fireMs - FAKE_NOW.getTime();
			expect(offsetMs % 60_000).toBe(0);
		}

		handle.stop();
	});
});

describe("scheduler — timer loop", () => {
	beforeEach(() => {
		vi.useFakeTimers({ now: FAKE_NOW });
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("calls the job after the computed delay", async () => {
		const job = vi.fn();
		const handle = schedule().every(1).minutes().run(job);

		expect(job).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(60_000);
		expect(job).toHaveBeenCalledTimes(1);

		handle.stop();
	});

	it("calls the job again after the second interval", async () => {
		const job = vi.fn();
		const handle = schedule().every(1).minutes().run(job);

		await vi.advanceTimersByTimeAsync(120_000);
		expect(job).toHaveBeenCalledTimes(2);

		handle.stop();
	});

	it("stop() before first fire: job is never called", async () => {
		const job = vi.fn();
		const handle = schedule().every(1).minutes().run(job);
		handle.stop();

		await vi.advanceTimersByTimeAsync(120_000);
		expect(job).not.toHaveBeenCalled();
	});

	it("stop() after first fire: job is not called again", async () => {
		const job = vi.fn();
		const handle = schedule().every(1).minutes().run(job);

		await vi.advanceTimersByTimeAsync(60_000);
		expect(job).toHaveBeenCalledTimes(1);

		handle.stop();
		await vi.advanceTimersByTimeAsync(120_000);
		expect(job).toHaveBeenCalledTimes(1);
	});

	it("schedule survives a throwing job", async () => {
		let callCount = 0;
		const job = vi.fn(async () => {
			callCount++;
			if (callCount === 1) throw new Error("oops");
		});

		const handle = schedule().every(1).minutes().run(job);

		await vi.advanceTimersByTimeAsync(60_000);
		expect(job).toHaveBeenCalledTimes(1);

		// Second fire should still happen despite the first throw
		await vi.advanceTimersByTimeAsync(60_000);
		expect(job).toHaveBeenCalledTimes(2);

		handle.stop();
	});

	it("async job completes before next schedule", async () => {
		const order: string[] = [];
		let resolveJob!: () => void;

		const job = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					order.push("start");
					resolveJob = () => {
						order.push("end");
						resolve();
					};
				}),
		);

		const handle = schedule().every(1).minutes().run(job);

		await vi.advanceTimersByTimeAsync(60_000);
		expect(order).toEqual(["start"]);

		resolveJob();
		await Promise.resolve(); // flush microtasks
		expect(order).toEqual(["start", "end"]);

		handle.stop();
	});
});

describe("scheduler — times()", () => {
	beforeEach(() => {
		vi.useFakeTimers({ now: new Date("2025-01-06T00:00:00.000Z") });
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("stops after exactly N runs", async () => {
		const job = vi.fn();
		const handle = schedule().every(1).minutes().times(3).run(job);

		await vi.advanceTimersByTimeAsync(4 * 60_000);
		expect(job).toHaveBeenCalledTimes(3);
		expect(handle.active).toBe(false);
	});

	it("times(1) fires once then becomes inactive", async () => {
		const job = vi.fn();
		const handle = schedule().every(1).minutes().times(1).run(job);

		await vi.advanceTimersByTimeAsync(2 * 60_000);
		expect(job).toHaveBeenCalledTimes(1);
		expect(handle.active).toBe(false);
	});
});

describe("scheduler — runNow()", () => {
	beforeEach(() => {
		vi.useFakeTimers({ now: new Date("2025-01-06T00:00:00.000Z") });
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("fires immediately at t=0 and again after the interval", async () => {
		const job = vi.fn();
		const handle = schedule().every(1).minutes().runNow().run(job);

		await vi.advanceTimersByTimeAsync(0);
		expect(job).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(60_000);
		expect(job).toHaveBeenCalledTimes(2);

		handle.stop();
	});

	it("runNow() + times(1) fires exactly once immediately", async () => {
		const job = vi.fn();
		const handle = schedule().every(1).minutes().runNow().times(1).run(job);

		await vi.advanceTimersByTimeAsync(0);
		expect(job).toHaveBeenCalledTimes(1);
		expect(handle.active).toBe(false);

		await vi.advanceTimersByTimeAsync(120_000);
		expect(job).toHaveBeenCalledTimes(1);
	});
});

describe("scheduler — jitter()", () => {
	beforeEach(() => {
		vi.useFakeTimers({ now: new Date("2025-01-06T00:00:00.000Z") });
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("still fires within the expected window despite jitter", async () => {
		const job = vi.fn();
		const JITTER = 5_000;
		const handle = schedule().every(1).minutes().jitter(JITTER).run(job);

		// Advance past the max possible delay (60s interval + 5s positive jitter)
		await vi.advanceTimersByTimeAsync(60_000 + JITTER);
		expect(job).toHaveBeenCalledTimes(1);

		handle.stop();
	});
});

describe("scheduler — once()", () => {
	beforeEach(() => {
		vi.useFakeTimers({ now: new Date("2025-01-06T00:00:00.000Z") });
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("fires exactly once at the target UTC time", async () => {
		const job = vi.fn();
		const handle: JobHandle = schedule()
			.once()
			.at("2025-01-06T01:00:00Z")
			.run(job);

		expect(job).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(59 * 60_000);
		expect(job).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(60_000);
		expect(job).toHaveBeenCalledTimes(1);
		expect(handle.active).toBe(false);

		// No second fire
		await vi.advanceTimersByTimeAsync(3_600_000);
		expect(job).toHaveBeenCalledTimes(1);
	});

	it("stop() before fire prevents execution", async () => {
		const job = vi.fn();
		const handle = schedule().once().at("2025-01-06T01:00:00Z").run(job);

		handle.stop();
		await vi.advanceTimersByTimeAsync(3_600_000);
		expect(job).not.toHaveBeenCalled();
		expect(handle.active).toBe(false);
	});

	it("fires immediately for a past target", async () => {
		const job = vi.fn();
		schedule().once().at("2025-01-05T23:00:00Z").run(job);

		await vi.advanceTimersByTimeAsync(0);
		expect(job).toHaveBeenCalledTimes(1);
	});

	it("does not fire immediately for a far-future target (>24.8 days)", async () => {
		const job = vi.fn();
		// Target is 30 days in the future from FAKE_NOW (2025-01-06)
		const handle = schedule().once().at("2025-02-05T00:00:00Z").run(job);

		// Advance less than 30 days — job must NOT have fired
		await vi.advanceTimersByTimeAsync(29 * 24 * 60 * 60 * 1000);
		expect(job).not.toHaveBeenCalled();
		expect(handle.active).toBe(true);

		// Advance past the target — now it fires
		await vi.advanceTimersByTimeAsync(2 * 24 * 60 * 60 * 1000);
		expect(job).toHaveBeenCalledTimes(1);
		expect(handle.active).toBe(false);
	});
});

describe("scheduler — onError", () => {
	beforeEach(() => {
		vi.useFakeTimers({ now: new Date("2025-01-06T00:00:00.000Z") });
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("calls onError when a recurring job throws", async () => {
		const onError = vi.fn();
		const err = new Error("boom");
		const job = vi.fn(() => {
			throw err;
		});

		const handle = schedule().every(1).minutes().run(job, { onError });

		await vi.advanceTimersByTimeAsync(60_000);
		expect(onError).toHaveBeenCalledTimes(1);
		expect(onError).toHaveBeenCalledWith(err);

		handle.stop();
	});

	it("schedule continues after a throwing job when onError is set", async () => {
		const onError = vi.fn();
		const job = vi.fn(() => {
			throw new Error("oops");
		});

		const handle = schedule().every(1).minutes().run(job, { onError });

		await vi.advanceTimersByTimeAsync(3 * 60_000);
		expect(job).toHaveBeenCalledTimes(3);
		expect(onError).toHaveBeenCalledTimes(3);

		handle.stop();
	});

	it("no onError: throwing job is silently ignored and schedule continues", async () => {
		const job = vi.fn(() => {
			throw new Error("silent");
		});

		const handle = schedule().every(1).minutes().run(job);

		await expect(
			vi.advanceTimersByTimeAsync(2 * 60_000),
		).resolves.not.toThrow();
		expect(job).toHaveBeenCalledTimes(2);

		handle.stop();
	});

	it("onError called when a once() job throws", async () => {
		const onError = vi.fn();
		const err = new Error("once-error");
		const job = vi.fn(() => {
			throw err;
		});

		const handle = schedule()
			.once()
			.at("2025-01-06T01:00:00Z")
			.run(job, { onError });

		await vi.advanceTimersByTimeAsync(3_600_000);
		expect(onError).toHaveBeenCalledTimes(1);
		expect(onError).toHaveBeenCalledWith(err);
		expect(handle.active).toBe(false);
	});

	it("schedule survives when onError itself throws", async () => {
		const onError = vi.fn(() => {
			throw new Error("onError exploded");
		});
		const job = vi.fn(() => {
			throw new Error("job failed");
		});

		const handle = schedule().every(1).minutes().run(job, { onError });

		await expect(
			vi.advanceTimersByTimeAsync(3 * 60_000),
		).resolves.not.toThrow();
		expect(job).toHaveBeenCalledTimes(3);
		expect(onError).toHaveBeenCalledTimes(3);

		handle.stop();
	});

	it("once() job: schedule survives when onError itself throws", async () => {
		const onError = vi.fn(() => {
			throw new Error("onError exploded");
		});
		const job = vi.fn(() => {
			throw new Error("job failed");
		});

		const handle = schedule()
			.once()
			.at("2025-01-06T01:00:00Z")
			.run(job, { onError });

		await expect(vi.advanceTimersByTimeAsync(3_600_000)).resolves.not.toThrow();
		expect(onError).toHaveBeenCalledTimes(1);
		expect(handle.active).toBe(false);
	});
});

describe("scheduler — nextRun", () => {
	beforeEach(() => {
		vi.useFakeTimers({ now: FAKE_NOW });
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("exposes the next fire time before the first run", () => {
		const handle = schedule()
			.every(1)
			.minutes()
			.run(() => {});
		expect(handle.nextRun).toBeInstanceOf(Date);
		expect(handle.nextRun?.getTime()).toBe(FAKE_NOW.getTime() + 60_000);
		handle.stop();
	});

	it("returns null after stop()", () => {
		const handle = schedule()
			.every(1)
			.minutes()
			.run(() => {});
		handle.stop();
		expect(handle.nextRun).toBeNull();
	});

	it("advances after each fire", async () => {
		const handle = schedule()
			.every(1)
			.minutes()
			.run(() => {});
		expect(handle.nextRun?.getTime()).toBe(FAKE_NOW.getTime() + 60_000);

		await vi.advanceTimersByTimeAsync(60_000);
		expect(handle.nextRun?.getTime()).toBe(FAKE_NOW.getTime() + 120_000);

		handle.stop();
	});

	it("once(): shows the target, then null after firing", async () => {
		const handle = schedule()
			.once()
			.at("2025-01-06T01:00:00Z")
			.run(() => {});
		expect(handle.nextRun?.toISOString()).toBe("2025-01-06T01:00:00.000Z");

		await vi.advanceTimersByTimeAsync(3_600_000);
		expect(handle.nextRun).toBeNull();
	});
});

describe("scheduler — unref", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it("calls unref on the timer only when unref: true", () => {
		vi.useRealTimers();
		const unrefSpy = vi.fn();
		const real = globalThis.setTimeout;
		const stub = ((...a: Parameters<typeof globalThis.setTimeout>) => {
			const t = real(...a);
			Object.defineProperty(t, "unref", {
				value: unrefSpy,
				configurable: true,
			});
			return t;
		}) as unknown as typeof globalThis.setTimeout;
		const spy = vi.spyOn(globalThis, "setTimeout").mockImplementation(stub);

		// Long interval so the timer never fires during the test.
		const a = schedule()
			.every(1)
			.minutes()
			.run(() => {}, { unref: true });
		expect(unrefSpy).toHaveBeenCalled();
		a.stop();

		unrefSpy.mockClear();
		const b = schedule()
			.every(1)
			.minutes()
			.run(() => {});
		expect(unrefSpy).not.toHaveBeenCalled();
		b.stop();

		spy.mockRestore();
	});
});

describe("scheduler — AbortSignal", () => {
	beforeEach(() => {
		vi.useFakeTimers({ now: FAKE_NOW });
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("aborting before the first fire prevents execution", async () => {
		const ac = new AbortController();
		const job = vi.fn();
		const handle = schedule()
			.every(1)
			.minutes()
			.run(job, { signal: ac.signal });

		ac.abort();
		expect(handle.active).toBe(false);

		await vi.advanceTimersByTimeAsync(120_000);
		expect(job).not.toHaveBeenCalled();
	});

	it("aborting after the first fire stops the schedule", async () => {
		const ac = new AbortController();
		const job = vi.fn();
		const handle = schedule()
			.every(1)
			.minutes()
			.run(job, { signal: ac.signal });

		await vi.advanceTimersByTimeAsync(60_000);
		expect(job).toHaveBeenCalledTimes(1);

		ac.abort();
		expect(handle.active).toBe(false);

		await vi.advanceTimersByTimeAsync(120_000);
		expect(job).toHaveBeenCalledTimes(1);
	});

	it("an already-aborted signal: the job never runs", async () => {
		const job = vi.fn();
		const handle = schedule()
			.every(1)
			.minutes()
			.run(job, { signal: AbortSignal.abort() });

		expect(handle.active).toBe(false);
		await vi.advanceTimersByTimeAsync(120_000);
		expect(job).not.toHaveBeenCalled();
	});

	it("once(): aborting before the target prevents the one-shot", async () => {
		const ac = new AbortController();
		const job = vi.fn();
		const handle = schedule()
			.once()
			.at("2025-01-06T01:00:00Z")
			.run(job, { signal: ac.signal });

		ac.abort();
		expect(handle.active).toBe(false);

		await vi.advanceTimersByTimeAsync(3_600_000);
		expect(job).not.toHaveBeenCalled();
	});
});

describe("scheduler — long delays (MAX_TIMEOUT chunking)", () => {
	beforeEach(() => {
		vi.useFakeTimers({ now: FAKE_NOW });
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("monthly schedule whose first delay exceeds MAX_TIMEOUT fires on the right date, not a month later", async () => {
		// FAKE_NOW = 2025-01-06; next 1st-of-month is Feb 1, ~26 days away (> 24.8d MAX_TIMEOUT)
		const job = vi.fn();
		const handle = schedule({ timezone: "UTC" })
			.every()
			.months()
			.on(1)
			.run(job);

		// Must target Feb 1, not skip ahead to March 1
		expect(handle.nextRun?.toISOString()).toBe("2025-02-01T00:00:00.000Z");

		const msToFeb1 = Date.parse("2025-02-01T00:00:00Z") - FAKE_NOW.getTime();
		await vi.advanceTimersByTimeAsync(msToFeb1 - 1_000);
		expect(job).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(1_000);
		expect(job).toHaveBeenCalledTimes(1);

		handle.stop();
	});
});

describe("scheduler — observability (lastRun / runCount)", () => {
	beforeEach(() => {
		vi.useFakeTimers({ now: FAKE_NOW });
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("runCount increments and lastRun tracks each fire", async () => {
		const handle = schedule()
			.every(1)
			.minutes()
			.run(() => {});
		expect(handle.runCount).toBe(0);
		expect(handle.lastRun).toBeNull();

		await vi.advanceTimersByTimeAsync(60_000);
		expect(handle.runCount).toBe(1);
		expect(handle.lastRun?.getTime()).toBe(FAKE_NOW.getTime() + 60_000);

		await vi.advanceTimersByTimeAsync(60_000);
		expect(handle.runCount).toBe(2);
		expect(handle.lastRun?.getTime()).toBe(FAKE_NOW.getTime() + 120_000);

		handle.stop();
	});

	it("runCount reflects the final count after times(n) is exhausted", async () => {
		const handle = schedule()
			.every(1)
			.minutes()
			.times(2)
			.run(() => {});
		await vi.advanceTimersByTimeAsync(3 * 60_000);
		expect(handle.runCount).toBe(2);
		expect(handle.active).toBe(false);
	});

	it("runCount/lastRun count throwing runs too", async () => {
		const job = vi.fn(() => {
			throw new Error("boom");
		});
		const handle = schedule()
			.every(1)
			.minutes()
			.run(job, { onError: () => {} });

		await vi.advanceTimersByTimeAsync(2 * 60_000);
		expect(handle.runCount).toBe(2);
		expect(handle.lastRun?.getTime()).toBe(FAKE_NOW.getTime() + 120_000);

		handle.stop();
	});
});

describe("scheduler — date bounds (starting / until)", () => {
	beforeEach(() => {
		vi.useFakeTimers({ now: FAKE_NOW });
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("starting(): does not fire before the start date", async () => {
		const job = vi.fn();
		// FAKE_NOW = 2025-01-06; start a day later
		const handle = schedule({ timezone: "UTC" })
			.every()
			.day()
			.at(0)
			.starting("2025-01-08T00:00:00Z")
			.run(job);

		expect(handle.nextRun?.toISOString()).toBe("2025-01-08T00:00:00.000Z");

		// Advance past Jan 7 midnight — must NOT fire (before start)
		await vi.advanceTimersByTimeAsync(1 * 24 * 60 * 60 * 1000);
		expect(job).not.toHaveBeenCalled();

		// Reach Jan 8 midnight — fires
		await vi.advanceTimersByTimeAsync(1 * 24 * 60 * 60 * 1000);
		expect(job).toHaveBeenCalledTimes(1);

		handle.stop();
	});

	it("until(): stops once the next fire would pass the bound", async () => {
		const job = vi.fn();
		// Daily at midnight, until Jan 8 12:00 → fires Jan 7 and Jan 8, then stops
		const handle = schedule({ timezone: "UTC" })
			.every()
			.day()
			.at(0)
			.until("2025-01-08T12:00:00Z")
			.run(job);

		await vi.advanceTimersByTimeAsync(10 * 24 * 60 * 60 * 1000);
		expect(job).toHaveBeenCalledTimes(2); // Jan 7 + Jan 8
		expect(handle.active).toBe(false);
	});

	it("until() accounts for jitter: a slot whose jittered fire exceeds the bound does not fire", async () => {
		const rand = vi.spyOn(Math, "random").mockReturnValue(1); // max positive jitter
		const job = vi.fn();
		// First daily slot is Jan 7 00:00Z; +30s jitter pushes the real fire to 00:00:30,
		// which is past the bound at 00:00:15 → must not fire.
		const handle = schedule({ timezone: "UTC" })
			.every()
			.day()
			.at(0)
			.jitter(30_000)
			.until("2025-01-07T00:00:15Z")
			.run(job);

		expect(handle.active).toBe(false);
		await vi.advanceTimersByTimeAsync(2 * 24 * 60 * 60 * 1000);
		expect(job).not.toHaveBeenCalled();

		rand.mockRestore();
	});

	it("starting()/until() reject an invalid datetime with a RangeError carrying cause", () => {
		expect(() =>
			schedule()
				.every()
				.day()
				.starting("not-a-date")
				.run(() => {}),
		).toThrow(RangeError);
		let caught: unknown;
		try {
			schedule()
				.every()
				.day()
				.until("nope")
				.run(() => {});
		} catch (e) {
			caught = e;
		}
		expect(caught).toBeInstanceOf(RangeError);
		expect((caught as RangeError & { cause?: unknown }).cause).toBeTruthy();
	});
});

describe("scheduler — toString()", () => {
	beforeEach(() => {
		vi.useFakeTimers({ now: FAKE_NOW });
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("describes a recurring schedule", () => {
		const handle = schedule({ timezone: "UTC" })
			.every()
			.day()
			.at("08:30")
			.run(() => {});
		expect(String(handle)).toBe("every day at 08:30 (UTC)");
		handle.stop();
	});

	it("describes a one-shot schedule", () => {
		const handle = schedule()
			.once()
			.at("2025-06-15T12:00:00Z")
			.run(() => {});
		expect(String(handle)).toBe("once at 2025-06-15T12:00:00.000Z");
		handle.stop();
	});

	it("RunStep can be described before running", () => {
		const step = schedule().every(5).minutes();
		expect(String(step)).toBe("every 5 minutes");
	});
});
