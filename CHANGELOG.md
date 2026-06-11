# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0] - 2026-06-11

### Added

- **`handle.nextRuns(n)`** — preview the next _n_ scheduled fire times (un-jittered
  grid times), respecting `.until()` and any remaining `.times(n)` budget.
- **`.between("09:00", "17:00")`** — confine an interval schedule
  (`seconds`/`minutes`/`hours`) to a daily time window; fires resume at the window
  start each day.
- **`.skip(date => …)`** — skip individual fires (e.g. holidays); the next
  non-skipped slot runs instead.
- **`handle.trigger()`** — run the job immediately, off-schedule, without
  disturbing the timer or consuming the `.times(n)` budget.
- **`handle.pause()` / `handle.resume()` / `handle.paused`** — temporarily halt and
  resume a schedule.
- **Node < 26 support** via the documented `@js-temporal/polyfill` path; calling
  `schedule()` without a global `Temporal` now throws a clear error pointing to it.
- **Continuous integration** across Node 22 (polyfill) and Node 26 (native).

### Fixed

- `once()` jobs now detach their `AbortSignal` listener after firing, so a shared
  controller doesn't accumulate listeners.

## [0.4.1]

Tightened scheduling semantics, validation, and DST handling. See the git history.

## [0.4.0]

Added date bounds (`.starting()`/`.until()`), multiple times of day, last/nth
weekdays, observability (`lastRun`/`runCount`), and `describeSchedule()`. See the
git history.
