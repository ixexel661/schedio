import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { schedule } from "../src/builder.js";

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
