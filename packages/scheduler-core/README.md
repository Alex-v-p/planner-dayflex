# scheduler-core

The pure, deterministic scheduling core for `planner-dayflex`. It deliberately
contains no web, database, queue, or AI dependencies.

## Public API

Build a validated `ScheduleRequest` from the framework-free contracts, then
call `schedule(request)`. The result contains the chronological plan items,
task-level structured placement or no-fit decisions, and valid input warnings.
Priority determines the order in which tasks are considered; each selected task
still uses the earliest remaining timeline window.

To recover after lost time, call `reschedule(previous_result, request)`. The
request supplies the updated current time, full task list, immutable
`TaskProgress` records, fixed events, and interruption blocks. The function
replans only remaining task minutes, retains completed scheduled portions as
immutable timeline history, and emits
`moved_after_interruption` or no-fit decision codes as applicable. It returns
that history and the remaining-day plan; past locks remain in the supplied
prior result. Both public functions leave their inputs unchanged.

## Toolchain

This package uses Python 3.13 and [uv](https://docs.astral.sh/uv/) for package
and environment management. The complete decision is recorded in
[ADR 0001](../../docs/architecture/decisions/0001-scheduler-core-toolchain.md).

Run every command from this directory:

```sh
uv sync --locked
uv run ruff format --check .
uv run ruff check .
uv run pytest
```

`uv sync --locked` creates an isolated `.venv`, installs the package and its
development tooling, and verifies the lockfile is current. The remaining
commands are the formatter, linter, and test checks run by GitHub CI.
