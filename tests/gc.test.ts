import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { schedule } from "../src/builder.js";

const FAKE_NOW = new Date("2025-01-06T00:00:00.000Z");
const noop = (): void => {};

// resolveGc() prefers an existing global.gc, so stubbing it lets us observe calls.
const gcSlot = globalThis as { gc?: () => void };
let originalGc: (() => void) | undefined;

describe("gcAfterRun", () => {
	beforeEach(() => {
		vi.useFakeTimers({ now: FAKE_NOW });
		originalGc = gcSlot.gc;
	});
	afterEach(() => {
		vi.useRealTimers();
		gcSlot.gc = originalGc;
	});

	it("requests a GC after each run when enabled", async () => {
		const gc = vi.fn();
		gcSlot.gc = gc;
		const h = schedule().every(1).seconds().run(noop, { gcAfterRun: true });

		await vi.advanceTimersByTimeAsync(2000);
		expect(gc).toHaveBeenCalledTimes(2);
		h.stop();
	});

	it("does not request a GC when not enabled", async () => {
		const gc = vi.fn();
		gcSlot.gc = gc;
		const h = schedule().every(1).seconds().run(noop);

		await vi.advanceTimersByTimeAsync(2000);
		expect(gc).not.toHaveBeenCalled();
		h.stop();
	});

	it("runs the GC even when the job throws", async () => {
		const gc = vi.fn();
		gcSlot.gc = gc;
		const h = schedule()
			.every(1)
			.seconds()
			.run(
				() => {
					throw new Error("boom");
				},
				{ gcAfterRun: true, onError: noop },
			);

		await vi.advanceTimersByTimeAsync(1000);
		expect(gc).toHaveBeenCalledTimes(1);
		h.stop();
	});

	it("trigger() also requests a GC when enabled", async () => {
		const gc = vi.fn();
		gcSlot.gc = gc;
		const h = schedule()
			.every()
			.day()
			.at("09:00")
			.run(noop, { gcAfterRun: true });

		await h.trigger();
		expect(gc).toHaveBeenCalledTimes(1);
		h.stop();
	});
});
