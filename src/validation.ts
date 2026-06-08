function assert(cond: boolean, msg: string): void {
	if (!cond) throw new RangeError(`schedio: ${msg}`);
}

export function validateEvery(n: number): void {
	assert(
		Number.isInteger(n) && n >= 1,
		`every() expects a positive integer ≥ 1, got: ${n}`,
	);
}

export function validateTimezone(tz: string): void {
	if (!tz) throw new RangeError(`schedio: timezone cannot be empty`);
	try {
		new Intl.DateTimeFormat("en", { timeZone: tz });
	} catch {
		throw new RangeError(`schedio: "${tz}" is not a valid IANA timezone`);
	}
}

export function validateAtMinute(minute: number): void {
	assert(
		Number.isInteger(minute) && minute >= 0 && minute <= 59,
		`at() expects a minute 0–59, got: ${minute}`,
	);
}

export function validateAtTime(time: string | number): void {
	if (typeof time === "number") {
		assert(
			Number.isInteger(time) && time >= 0 && time <= 23,
			`at() expects an hour 0–23, got: ${time}`,
		);
		return;
	}
	const match = /^(\d{1,2}):(\d{2})$/.exec(time);
	assert(match !== null, `at() expects "HH:MM", got: "${time}"`);
	const h = parseInt(match![1], 10);
	const m = parseInt(match![2], 10);
	assert(
		h >= 0 && h <= 23 && m >= 0 && m <= 59,
		`at() expects a time 00:00–23:59, got: "${time}"`,
	);
}

export function validateOnDay(day: number): void {
	assert(
		Number.isInteger(day) && day >= 1 && day <= 31,
		`on() expects a day 1–31, got: ${day}`,
	);
}

export function validateOnMonthDay(monthDay: string): void {
	const match = /^(\d{2})-(\d{2})$/.exec(monthDay);
	assert(match !== null, `on() expects "MM-DD" format, got: "${monthDay}"`);
	const mo = parseInt(match![1], 10);
	const d = parseInt(match![2], 10);
	assert(mo >= 1 && mo <= 12, `on() expects month 01–12, got: "${monthDay}"`);
	assert(d >= 1 && d <= 31, `on() expects day 01–31, got: "${monthDay}"`);
}

export function validateTimes(n: number): void {
	assert(
		Number.isInteger(n) && n >= 1,
		`times() expects a positive integer ≥ 1, got: ${n}`,
	);
}

export function validateJitter(ms: number): void {
	assert(ms >= 0, `jitter() expects a non-negative number, got: ${ms}`);
}
