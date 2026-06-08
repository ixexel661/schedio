import { afterEach, beforeEach, vi } from "vitest";

// A known Monday at midnight UTC — used as the fixed "now" in timer tests
export const FAKE_NOW = new Date("2025-01-06T00:00:00.000Z");

export function useFakeTimers() {
	beforeEach(() => {
		vi.useFakeTimers({ now: FAKE_NOW });
	});
	afterEach(() => {
		vi.useRealTimers();
	});
}
