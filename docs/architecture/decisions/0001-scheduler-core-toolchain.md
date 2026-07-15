# ADR 0001: Scheduler-core Python toolchain

**Status:** Accepted

**Date:** 2026-06-20

**Ticket:** TKT-002

## Context

The first executable project increment is the pure deterministic scheduler
core. It needs a small, repeatable local toolchain that CI can run unchanged,
without introducing an application service, infrastructure, or runtime
dependency.

## Decision

`packages/scheduler-core/` uses the following toolchain:

| Concern | Choice |
| --- | --- |
| Runtime | Python 3.13 |
| Package manager and environment manager | uv |
| Package metadata/build backend | `pyproject.toml` with setuptools |
| Formatter and linter | Ruff |
| Test runner | pytest |

The package uses `tzdata` at runtime so IANA zones and daylight-saving validation
work consistently on Windows and CI. Setuptools, Ruff, and pytest are build or
development dependencies only. Python 3.13 is pinned in
`.python-version`, constrained by package metadata, and selected explicitly in
CI.

Run these commands from `packages/scheduler-core/`:

```sh
uv sync --locked
uv run ruff format --check .
uv run ruff check .
uv run pytest
```

`uv sync --locked` installs the package and its development tooling into an
isolated `.venv` from the committed lockfile. CI runs the same installation,
format, lint, and test commands in that order.

## Consequences

- Scheduler rules can remain a small, framework-free Python package.
- Contributors need uv and Python 3.13 to run the documented commands.
- The committed lockfile makes the development toolchain reproducible.
- Caching is intentionally deferred until the first CI gate has proven
  correct, in line with the testing strategy.
