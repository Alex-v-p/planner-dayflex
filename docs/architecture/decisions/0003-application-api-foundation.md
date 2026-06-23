# ADR 0003: Application API persistence and migration foundation

**Status:** Accepted

**Date:** 2026-06-23

**Ticket:** TKT-008

## Context

The deterministic scheduler has a narrow transport boundary, but later MVP
tickets also need one browser-facing application boundary to validate requests,
authorize users, persist user-owned planning data, and orchestrate scheduler
calls. That boundary needs a durable database and migration convention before
the first product model exists. It must not pull scheduler policy, account
behavior, product tables, Docker, Compose, AI, or a worker into this foundation.

## Decision

Create `services/api/` as a Python 3.13 FastAPI application service using `uv`,
Ruff, and pytest. It uses typed Pydantic Settings with an explicitly required
`PLANNER_API_DATABASE_URL`; normal development and production configurations
accept only `postgresql+psycopg` URLs. Test configuration explicitly opts into a
fresh SQLite database, never as a production fallback.

The service owns a synchronous SQLAlchemy 2.x engine and session factory, using
psycopg 3 for PostgreSQL. `Database.check_connection()` executes `SELECT 1` as
the explicit database-readiness convention, while `GET /health` remains a
dependency-free liveness endpoint. Logging is JSON with a small allowlist of
operational fields and no settings, request, or arbitrary message values; it
also replaces Uvicorn error and access handlers so request targets and query
strings cannot leak through default access formatting.

Initialize Alembic alongside the service with the standard generic revision
template and configure it through the same typed settings. There are no ORM
models, metadata, product tables, revisions, backfills, or rollbacks in this
ticket. Later data-model tickets must introduce those deliberately and use
reviewed migrations.

## Consequences

- The application API has a stable home for future validation, authorization,
  persistence, orchestration, and browser DTOs without taking over scheduler
  algorithms or UI rules.
- PostgreSQL is the durable runtime store; the isolated SQLite convention keeps
  ordinary tests self-contained and does not change production storage.
- A migration command can be validated now, but no application data exists to
  migrate yet. Therefore this ticket has no schema backfill or rollback work.
- Docker and Compose remain deferred. Any later container/topology ticket must
  define runtime configuration and health/readiness checks proportionately.
