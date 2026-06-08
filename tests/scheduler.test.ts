import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { schedule } from "../src/builder.js";
import type { JobHandle } from "../src/types.js";

// Use a known Monday at midnight UTC
const FAKE_NOW = new Date("2025-01-06T00:00:00.000Z");

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
});
