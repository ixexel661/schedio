# schedio

A zero-dependency Node.js scheduling library with a fluent, human-readable API - no cron syntax required.

```ts
schedule().every(5).minutes().run(() => console.log('tick'))

schedule().every().day().at('08:30').run(sendDailyReport)

schedule().every().monday().at('09:00').run(weeklySync)

schedule().once().at('2026-12-31T23:59:00').run(fireworks)
```

## Features

- **Fluent API** — readable chains instead of cron strings
- **TypeScript-first** — invalid chains are caught at compile time, all step types are exported
- **Calendar-aligned** — `every().day().at('08:30')` always fires at 08:30, not 24 h after startup
- **Weekday sets** — `every().weekdays()`, `weekends()`, or `weeks().on('monday', 'friday')`
- **Multiple times a day** — `every().day().at('09:00', '17:00')`
- **Last & nth days** — `every().month().on('last')` or `on('last', 'friday')`
- **Date bounds** — `.starting(date)` / `.until(date)` confine a recurring schedule to a window
- **One-shot scheduling** — `once().at(datetime)` fires exactly once at an absolute point in time
- **Run modifiers** — `.times(n)`, `.runNow()`, `.jitter(ms)` compose freely on any chain
- **Inspectable** — the handle exposes `nextRun`, `lastRun`, `runCount`, and a readable `toString()`
- **Cancellation** — stop via `handle.stop()` or an `AbortSignal`; opt out of keeping the process alive with `unref`
- **Error handling** — optional `onError` callback; job failures never stop the schedule
- **Input validation** — invalid arguments throw a `RangeError` with a clear message immediately
- **Zero dependencies** — pure Node.js, nothing to audit

## Requirements

Node.js ≥ 26 (uses the [Temporal API](https://tc39.es/proposal-temporal/))

## Installation

```bash
npm install schedio
# or
pnpm add schedio
# or
yarn add schedio
```

## Usage

### Import

```ts
import { schedule } from 'schedio'
```

### Every N units

```ts
// Every 5 minutes
schedule().every(5).minutes().run(job)

// Every 30 seconds
schedule().every(30).seconds().run(job)

// Every 2 hours
schedule().every(2).hours().run(job)

// Every 3 months
schedule().every(3).months().run(job)
```

Singular aliases work too: `.second()`, `.minute()`, `.hour()`, `.day()`, `.week()`, `.month()`, `.year()`.

### With a specific time offset

```ts
// Every hour at minute :15  (e.g. 00:15, 01:15, 02:15 …)
schedule().every().hours().at(15).run(job)

// Every day at 08:30
schedule().every().days().at('08:30').run(job)

// Every day at midnight (default)
schedule().every().days().run(job)
```

### Multiple times a day

Pass several times to `.at()` to fire more than once per day; the schedule runs at whichever listed time comes next. Works for daily, weekly, monthly, and yearly chains.

```ts
// Every day at 09:00 and 17:00
schedule().every().day().at('09:00', '17:00').run(job)

// Every weekday at 08:00, 12:00 and 18:00
schedule().every().weekdays().at('08:00', '12:00', '18:00').run(job)
```

### Specific weekday

```ts
// Every Monday at 09:00
schedule().every().monday().at('09:00').run(job)

// Every Friday at 17:00
schedule().every().friday().at('17:00').run(job)

// Every week on Thursday (time defaults to 00:00)
schedule().every().weeks().thursday().run(job)
```

### Multiple weekdays

Fire on several weekdays at the same time of day. The schedule runs on whichever listed day comes next.

```ts
// Every weekday (Monday–Friday) at 09:00
schedule().every().weekdays().at('09:00').run(job)

// Every weekend day (Saturday & Sunday) at 10:00
schedule().every().weekends().at('10:00').run(job)

// A custom set of days
schedule().every().weeks().on('monday', 'wednesday', 'friday').at('09:00').run(job)
```

### Monthly

```ts
// First of every month at midnight
schedule().every().months().run(job)

// 15th of every month at 09:00
schedule().every().months().on(15).at('09:00').run(job)

// Every quarter on the 1st at 08:00
schedule().every(3).months().on(1).at('08:00').run(job)

// Last day of every month at 23:00
schedule().every().months().on('last').at('23:00').run(job)

// The last Friday of every month at 17:00
schedule().every().months().on('last', 'friday').at('17:00').run(job)

// The first Monday of every month
schedule().every().months().on('first', 'monday').run(job)
```

The ordinal accepts `'first'`, `'second'`, `'third'`, `'fourth'`, or `'last'`.

> **Note:** Days that don't exist in a given month are clamped to the last valid day.
> For example, `.on(31)` in February fires on the 28th (or 29th in a leap year).

### Yearly

```ts
// Every year on January 1st
schedule().every().years().run(job)

// Every year on March 15th
schedule().every().years().on('03-15').run(job)

// Every year on December 31st at 23:00
schedule().every().years().on('12-31').at('23:00').run(job)
```

### One-shot scheduling

Run a job exactly once at an absolute point in time. The target can be a plain datetime string (interpreted in the configured timezone), a UTC/offset string, an IANA-annotated string, a `Temporal.Instant`, or a `Temporal.ZonedDateTime`.

```ts
// Plain datetime — interpreted in the schedule's timezone (or system timezone)
schedule().once().at('2026-12-31T23:59:00').run(job)

// UTC
schedule().once().at('2026-12-31T23:59:00Z').run(job)

// IANA timezone annotation
schedule().once().at('2026-12-31T23:59:00[Europe/Berlin]').run(job)

// Temporal.Instant
schedule().once().at(Temporal.Instant.from('2026-12-31T22:59:00Z')).run(job)
```

The returned `JobHandle` becomes inactive after the job fires. Calling `stop()` before the target time cancels the execution.

### Run modifiers

These methods chain onto any `RunStep` (i.e. after `.seconds()`, `.minutes()`, `.hours()`, `.days()`, `.at()`, etc.) and compose freely:

#### `.times(n)` — stop after N runs

```ts
schedule().every(30).seconds().times(5).run(job)  // fires 5 times, then stops
```

#### `.runNow()` — fire immediately, then continue on schedule

```ts
schedule().every().day().at('08:30').runNow().run(job)  // fires now + every day at 08:30
```

#### `.jitter(ms)` — add random spread to avoid peaks

```ts
// Each tick is offset by a random value in the range [-5000ms, +5000ms]
schedule().every(10).minutes().jitter(5_000).run(job)
```

Modifiers can be combined in any order:

```ts
schedule().every(5).seconds().times(3).runNow().jitter(200).run(job)
```

#### `.starting(date)` / `.until(date)` — confine to a date window

```ts
// Don't start before July 1st; first run is the first scheduled slot on/after it
schedule().every().day().at('09:00').starting('2026-07-01').run(job)

// Stop automatically after the year ends
schedule().every().day().at('09:00').until('2026-12-31T23:59:59Z').run(job)
```

`.starting()` / `.until()` accept the same datetime inputs as `once().at()`. The schedule
ends as soon as the next fire would pass the `until` bound.

### Error handling

By default, job errors are silently swallowed so the schedule is never interrupted. Pass an `onError` callback to handle them:

```ts
schedule().every().minutes().run(job, {
  onError: (err) => logger.error('Job failed', err),
})

schedule().once().at('2026-01-01T00:00:00Z').run(job, {
  onError: console.error,
})
```

### Timezone

```ts
schedule({ timezone: 'America/New_York' }).every().day().at('09:00').run(job)

// once() respects the same timezone for plain datetime strings
schedule({ timezone: 'Asia/Tokyo' }).once().at('2026-06-15T10:00:00').run(job)
```

### Stopping a job

`.run()` returns a `JobHandle`:

```ts
const handle = schedule().every(5).minutes().run(job)

// Later …
handle.stop()

console.log(handle.active) // false
```

`stop()` is idempotent - calling it multiple times is safe.

### Inspecting the schedule

The `JobHandle` exposes a few read-only properties for monitoring:

- `nextRun` — a `Date` of the next scheduled fire (including jitter), or `null` once stopped/exhausted
- `lastRun` — a `Date` of the most recent execution, or `null` before the first run
- `runCount` — how many times the job has executed
- `toString()` — a human-readable description of the schedule

```ts
const handle = schedule().every().day().at('08:30').run(job)

console.log(String(handle))  // → "every day at 08:30"
console.log(handle.nextRun)  // → Date of the next 08:30
console.log(handle.runCount) // → 0 (until it first fires)
console.log(handle.lastRun)  // → null (until it first fires)
```

You can also describe a chain before running it, or render a descriptor directly with the exported `describeSchedule`:

```ts
import { describeSchedule } from 'schedio'

String(schedule().every(5).minutes())        // → "every 5 minutes"
```

### Cancelling with an AbortSignal

Pass an `AbortSignal` to stop the schedule when the signal aborts — equivalent to calling `stop()`. If the signal is already aborted, the job never runs.

```ts
const controller = new AbortController()

schedule().every(5).minutes().run(job, { signal: controller.signal })

// Later — stops the schedule
controller.abort()
```

### Not keeping the process alive

By default an active schedule keeps the Node.js process running. Pass `unref: true` so the timers don't block a graceful exit (useful for background tasks in short-lived processes):

```ts
schedule().every().hours().run(job, { unref: true })
```

### Async jobs

Job functions can be `async`. The next run is only scheduled *after* the current execution completes, so slow jobs never overlap:

```ts
schedule().every().hours().run(async () => {
  await syncDatabase()
  await sendHeartbeat()
})
```

### TypeScript — typing chain steps

All step classes are exported, so you can annotate variables explicitly:

```ts
import type { AtTimeStep, RunStep } from 'schedio'

const daily: AtTimeStep = schedule().every().days()
const withTime: RunStep = daily.at('08:30')
```

## API Reference

### `schedule(options?)`

Returns an `EveryStep`. Accepts an optional `ScheduleOptions` object:

```ts
interface ScheduleOptions {
  timezone?: string  // IANA timezone, e.g. 'Europe/Berlin'. Defaults to system timezone.
}
```

---

### Chain steps

| Step | Method | Returns | Description |
|---|---|---|---|
| `EveryStep` | `.every(n?)` | `UnitStep` | Set the multiplier (default `1`) |
| `EveryStep` | `.once()` | `OnceStep` | Start a one-shot chain |
| `UnitStep` | `.seconds()` / `.second()` | `RunStep` | Interval in seconds |
| `UnitStep` | `.minutes()` / `.minute()` | `RunStep` | Interval in minutes |
| `UnitStep` | `.hours()` / `.hour()` | `AtMinuteStep` | Interval in hours |
| `UnitStep` | `.days()` / `.day()` | `AtTimeStep` | Interval in days |
| `UnitStep` | `.weeks()` / `.week()` | `WeekdayOrAtStep` | Interval in weeks |
| `UnitStep` | `.monday()` … `.sunday()` | `AtTimeStep` | Shorthand: weekly on a named day |
| `UnitStep` | `.weekdays()` / `.weekends()` | `AtTimeStep` | Shorthand: Mon–Fri / Sat–Sun |
| `UnitStep` | `.months()` / `.month()` | `AtDayStep` | Interval in months |
| `UnitStep` | `.years()` / `.year()` | `AtMonthDayStep` | Interval in years |
| `AtMinuteStep` | `.at(minute)` | `RunStep` | Minute offset within the hour (0–59) |
| `AtTimeStep` | `.at(...times)` | `RunStep` | One or more times of day — `"HH:MM"` string(s) or hour number(s) (0–23) |
| `AtDayStep` | `.on(day)` | `AtTimeStep` | Day of month (1–31), or `"last"` for the last day |
| `AtDayStep` | `.on(ordinal, weekday)` | `AtTimeStep` | Nth weekday, e.g. `.on('last', 'friday')` |
| `AtMonthDayStep` | `.on(monthDay)` | `AtTimeStep` | Month and day as `"MM-DD"` string |
| `WeekdayOrAtStep` | `.monday()` … `.sunday()` | `AtTimeStep` | Day of week |
| `WeekdayOrAtStep` | `.weekdays()` / `.weekends()` | `AtTimeStep` | Mon–Fri / Sat–Sun |
| `WeekdayOrAtStep` | `.on(...days)` | `AtTimeStep` | A custom set of weekdays |
| `OnceStep` | `.at(target)` | `OnceFiredStep` | Absolute target time |
| `OnceFiredStep` | `.run(job, options?)` | `JobHandle` | Schedule the one-shot |
| `RunStep` | `.times(n)` | `RunStep` | Stop after N runs |
| `RunStep` | `.runNow()` | `RunStep` | Fire immediately on start |
| `RunStep` | `.jitter(ms)` | `RunStep` | Add ±ms random spread per tick |
| `RunStep` | `.starting(date)` | `RunStep` | Don't fire before `date` |
| `RunStep` | `.until(date)` | `RunStep` | Stop once the next fire would pass `date` |
| `RunStep` | `.run(job, options?)` | `JobHandle` | Start the schedule |

Every step that has an optional `.at()` or `.on()` also exposes `.run()` directly, so the time offset is always optional.

---

### `RunOptions`

```ts
interface RunOptions {
  onError?: (err: unknown) => void  // called when the job throws; schedule continues
  unref?: boolean                   // don't let timers keep the process alive
  signal?: AbortSignal              // aborting stops the schedule
}
```

---

### `JobHandle`

```ts
interface JobHandle {
  stop(): void
  readonly active: boolean
  readonly nextRun: Date | null  // next scheduled fire (incl. jitter), or null if stopped
  readonly lastRun: Date | null  // most recent execution, or null before the first run
  readonly runCount: number      // how many times the job has executed
  toString(): string             // human-readable description, e.g. "every day at 08:30"
}
```

---

### `Job`

```ts
type Job = () => void | Promise<void>
```

---

### Input validation

All public API arguments are validated immediately. Invalid inputs throw a `RangeError` with a message prefixed `"schedio:"`:

```ts
schedule().every(0).minutes().run(job)
// → RangeError: schedio: every() expects a positive integer ≥ 1, got: 0

schedule({ timezone: 'Mars/Olympus' })
// → RangeError: schedio: "Mars/Olympus" is not a valid IANA timezone

schedule().every().hours().at(99).run(job)
// → RangeError: schedio: at() expects a minute 0–59, got: 99
```

## Examples

Two runnable examples are included in the [`examples/`](examples/) directory:

| Script | Description |
|---|---|
| [`examples/every-second.ts`](examples/every-second.ts) | Prints the current ISO timestamp once per second |

```bash
pnpm example:seconds   # Ctrl+C to stop
```

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm test:watch
pnpm test:coverage
pnpm typecheck
```

## License

[MIT](LICENSE)
