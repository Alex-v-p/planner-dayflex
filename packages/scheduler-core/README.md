# scheduler-core

The pure, deterministic scheduling core for `planner-dayflex`. It deliberately
contains no web, database, queue, or AI dependencies.

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
