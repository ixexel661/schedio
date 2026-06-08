# schedio

A zero-dependency Node.js scheduling library with a fluent, human-readable API no cron syntax required.

```ts
schedule().every(5).minutes().run(() => console.log('tick'))

schedule().every().day().at('08:30').run(sendDailyReport)

schedule().every().monday().at('09:00').run(weeklySync)
```

## Features

- **Fluent API** — readable chains instead of cron strings
- **TypeScript-first** — invalid chains are caught at compile time
- **Calendar-aligned** — `every().day().at('08:30')` always fires at 08:30, not 24 h after startup
- **Zero dependencies** — pure Node.js timers, nothing to audit
- **Dual ESM + CJS** — works in both module systems

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

// 15th of every month
schedule().every().months().on(15).run(job)

// 15th of every month at 09:00
schedule().every().months().on(15).at('09:00').run(job)

// Every quarter on the 1st
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

### Stopping a job

`.run()` returns a `JobHandle` that lets you stop the schedule at any time:

```ts
const handle = schedule().every(5).minutes().run(job)

// Later …
handle.stop()

console.log(handle.active) // false
```

`stop()` is idempotent — calling it multiple times is safe.

### Async jobs

Job functions can be `async`. The next run is only scheduled *after* the current execution completes, so slow jobs never overlap:

```ts
schedule().every().hours().run(async () => {
  await syncDatabase()
  await sendHeartbeat()
})
```

If a job throws (or rejects), the error is swallowed and the schedule continues. Handle errors inside your job function:

```ts
schedule().every(10).minutes().run(async () => {
  try {
    await riskyOperation()
  } catch (err) {
    logger.error(err)
  }
})
```

## API Reference

### `schedule()`

Returns an `EveryStep` to start a new chain.

---

### Chain steps

| Step | Method | Returns | Description |
|---|---|---|---|
| `EveryStep` | `.every(n?)` | `UnitStep` | Set the multiplier (default `1`) |
| `UnitStep` | `.seconds()` | `RunStep` | Interval in seconds |
| `UnitStep` | `.minutes()` | `RunStep` | Interval in minutes |
| `UnitStep` | `.hours()` | `AtMinuteStep` | Interval in hours |
| `UnitStep` | `.days()` | `AtTimeStep` | Interval in days |
| `UnitStep` | `.weeks()` | `WeekdayOrAtStep` | Interval in weeks |
| `UnitStep` | `.monday()` … `.sunday()` | `AtTimeStep` | Shorthand: weekly on a named day |
| `UnitStep` | `.months()` | `AtDayStep` | Interval in months |
| `UnitStep` | `.years()` | `AtMonthDayStep` | Interval in years |
| `AtMinuteStep` | `.at(minute)` | `RunStep` | Minute offset within the hour (0–59) |
| `AtTimeStep` | `.at(time)` | `RunStep` | Time of day — `"HH:MM"` string or hour number |
| `AtDayStep` | `.on(day)` | `AtTimeStep` | Day of month (1–31) |
| `AtMonthDayStep` | `.on(monthDay)` | `AtTimeStep` | Month and day as `"MM-DD"` string |
| `RunStep` | `.run(job)` | `JobHandle` | Start the schedule |

Every step that has an optional `.at()` or `.on()` also exposes `.run()` directly, so the time offset is always optional.

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

## Examples

Two runnable examples are included in the [`examples/`](examples/) directory:

| Script | Description |
|---|---|
| [`examples/every-second.ts`](examples/every-second.ts) | Prints the current ISO timestamp once per second |
| [`examples/every-minute-at-15s.ts`](examples/every-minute-at-15s.ts) | Waits for the next `:15`-second mark, then prints `Hello World` with timestamp every minute |

```bash
pnpm example:seconds   # Ctrl+C to stop
pnpm example:minutes   # waits up to 15 s for first output, then fires every minute
```

## Development

```bash
pnpm install       # install devDependencies
pnpm build         # bundle to dist/
pnpm test          # run tests
pnpm test:watch    # watch mode
pnpm test:coverage # coverage report
pnpm typecheck     # tsc --noEmit
```

## License

[MIT](LICENSE)
