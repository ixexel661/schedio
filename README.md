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
- **One-shot scheduling** — `once().at(datetime)` fires exactly once at an absolute point in time
- **Run modifiers** — `.times(n)`, `.runNow()`, `.jitter(ms)` compose freely on any chain
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

### Specific weekday

```ts
// Every Monday at 09:00
schedule().every().monday().at('09:00').run(job)

// Every Friday at 17:00
schedule().every().friday().at('17:00').run(job)

// Every week on Thursday (time defaults to 00:00)
schedule().every().weeks().thursday().run(job)
```

### Monthly

```ts
// First of every month at midnight
schedule().every().months().run(job)

// 15th of every month at 09:00
schedule().every().months().on(15).at('09:00').run(job)

// Every quarter on the 1st at 08:00
schedule().every(3).months().on(1).at('08:00').run(job)
```

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
| `UnitStep` | `.months()` / `.month()` | `AtDayStep` | Interval in months |
| `UnitStep` | `.years()` / `.year()` | `AtMonthDayStep` | Interval in years |
| `AtMinuteStep` | `.at(minute)` | `RunStep` | Minute offset within the hour (0–59) |
| `AtTimeStep` | `.at(time)` | `RunStep` | Time of day — `"HH:MM"` string or hour number (0–23) |
| `AtDayStep` | `.on(day)` | `AtTimeStep` | Day of month (1–31) |
| `AtMonthDayStep` | `.on(monthDay)` | `AtTimeStep` | Month and day as `"MM-DD"` string |
| `WeekdayOrAtStep` | `.monday()` … `.sunday()` | `AtTimeStep` | Day of week |
| `OnceStep` | `.at(target)` | `OnceFiredStep` | Absolute target time |
| `OnceFiredStep` | `.run(job, options?)` | `JobHandle` | Schedule the one-shot |
| `RunStep` | `.times(n)` | `RunStep` | Stop after N runs |
| `RunStep` | `.runNow()` | `RunStep` | Fire immediately on start |
| `RunStep` | `.jitter(ms)` | `RunStep` | Add ±ms random spread per tick |
| `RunStep` | `.run(job, options?)` | `JobHandle` | Start the schedule |

Every step that has an optional `.at()` or `.on()` also exposes `.run()` directly, so the time offset is always optional.

---

### `RunOptions`

```ts
interface RunOptions {
  onError?: (err: unknown) => void
}
```

---

### `JobHandle`

```ts
interface JobHandle {
  stop(): void
  readonly active: boolean
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
