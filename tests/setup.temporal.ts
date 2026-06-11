// On Node ≥ 26 the global `Temporal` exists and this is a no-op. On older Node
// (the CI matrix runs 22.x) we inject the @js-temporal/polyfill so the entire
// suite also exercises the documented polyfill path end-to-end.
if (typeof (globalThis as { Temporal?: unknown }).Temporal === "undefined") {
	const { Temporal } = await import("@js-temporal/polyfill");
	(globalThis as { Temporal?: unknown }).Temporal = Temporal;
}
