import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { schedule } from "../src/builder.js";

// A known Monday at midnight UTC
const FAKE_NOW = new Date("2025-01-06T00:00:00.000Z");
const noop = (): void => {};

describe("handle — nextRuns()", () => {
	beforeEach(() => vi.useFakeTimers({ now: FAKE_NOW }));
	afterEach(() => vi.useRealTimers());

	it("returns the next N un-jittered grid times", () => {
		const h = schedule({ timezone: "UTC" }).every().day().at("09:00").run(noop);
		const runs = h.nextRuns(3).map((d) => d.toISOString());
		expect(runs).toEqual([
			"2025-01-06T09:00:00.000Z",
			"2025-01-07T09:00:00.000Z",
			"2025-01-08T09:00:00.000Z",
		]);
		h.stop();
	});

	it("respects the .times(n) budget", () => {
		const h = schedule({ timezone: "UTC" })
			.every()
			.day()
			.at("09:00")
			.times(2)
			.run(noop);
		expect(h.nextRuns(5)).toHaveLength(2);
		h.stop();
	});

	it("respects .until()", () => {
		const h = schedule({ timezone: "UTC" })
			.every()
			.day()
			.at("09:00")
			.until("2025-01-08T23:59:59Z")
			.run(noop);
		// 06th, 07th, 08th at 09:00 are ≤ bound; 09th is past it
		expect(h.nextRuns(10)).toHaveLength(3);
		h.stop();
	});

	it("returns [] once stopped", () => {
		const h = schedule({ timezone: "UTC" }).every().day().at("09:00").run(noop);
		h.stop();
		expect(h.nextRuns(3)).toEqual([]);
	});

	it("for once() returns the single target", () => {
		const h = schedule().once().at("2030-01-01T00:00:00Z").run(noop);
		const runs = h.nextRuns(3);
		expect(runs).toHaveLength(1);
		expect(runs[0]?.toISOString()).toBe("2030-01-01T00:00:00.000Z");
		h.stop();
	});
});

describe("handle — trigger()", () => {
	beforeEach(() => vi.useFakeTimers({ now: FAKE_NOW }));
	afterEach(() => vi.useRealTimers());

	it("runs immediately without disturbing the schedule", async () => {
		const job = vi.fn();
		const h = schedule({ timezone: "UTC" }).every().day().at("09:00").run(job);
		const before = h.nextRun?.getTime();
		await h.trigger();
		expect(job).toHaveBeenCalledTimes(1);
		expect(h.runCount).toBe(1);
		expect(h.lastRun).not.toBeNull();
		expect(h.nextRun?.getTime()).toBe(before); // unchanged
		h.stop();
	});

	it("routes errors to onError", async () => {
		const onError = vi.fn();
		const h = schedule({ timezone: "UTC" })
			.every()
			.day()
			.at("09:00")
			.run(
				() => {
					throw new Error("boom");
				},
				{ onError },
			);
		await h.trigger();
		expect(onError).toHaveBeenCalledOnce();
		expect(h.runCount).toBe(1);
		h.stop();
	});

	it("does not consume the .times(n) budget", async () => {
		const job = vi.fn();
		const h = schedule().every(1).seconds().times(1).run(job);
		await h.trigger();
		expect(h.runCount).toBe(1);
		expect(h.active).toBe(true); // scheduled run still pending
		await vi.advanceTimersByTimeAsync(1000);
		expect(job).toHaveBeenCalledTimes(2); // manual + the one scheduled run
		expect(h.active).toBe(false); // now exhausted
	});

	it("for once() fires now and cancels the scheduled fire", async () => {
		const job = vi.fn();
		const h = schedule().once().at("2030-01-01T00:00:00Z").run(job);
		await h.trigger();
		expect(job).toHaveBeenCalledTimes(1);
		expect(h.active).toBe(false);
		await vi.advanceTimersByTimeAsync(1000);
		expect(job).toHaveBeenCalledTimes(1); // no double fire
	});
});

describe("handle — pause() / resume()", () => {
	beforeEach(() => vi.useFakeTimers({ now: FAKE_NOW }));
	afterEach(() => vi.useRealTimers());

	it("pause stops firing; resume continues", async () => {
		const job = vi.fn();
		const h = schedule().every(1).seconds().run(job);

		await vi.advanceTimersByTimeAsync(1000);
		expect(job).toHaveBeenCalledTimes(1);

		h.pause();
		expect(h.paused).toBe(true);
		expect(h.nextRun).toBeNull();

		await vi.advanceTimersByTimeAsync(5000);
		expect(job).toHaveBeenCalledTimes(1); // no fires while paused

		h.resume();
		expect(h.paused).toBe(false);
		expect(h.nextRun).not.toBeNull();

		await vi.advanceTimersByTimeAsync(1000);
		expect(job).toHaveBeenCalledTimes(2);
		h.stop();
	});

	it("is safe to call when stopped", () => {
		const h = schedule().every(1).seconds().run(noop);
		h.stop();
		expect(() => {
			h.pause();
			h.resume();
		}).not.toThrow();
		expect(h.paused).toBe(false);
	});
});
