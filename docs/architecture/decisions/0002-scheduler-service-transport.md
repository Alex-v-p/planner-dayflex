# ADR 0002: Scheduler service HTTP transport boundary

**Status:** Accepted

**Date:** 2026-06-23

**Ticket:** TKT-007

## Context

The deterministic scheduler core now needs a stable process-facing contract for
the future application API. It must expose initial planning and interruption
recovery without moving scheduling rules into a web framework or coupling the
core to persistence, queues, AI, models, or the browser.

## Decision

Create `services/scheduler/` as a small FastAPI ASGI transport boundary. It
exports `GET /health`, `POST /v1/schedule-day`, and
`POST /v1/reschedule-day`. Explicit Pydantic DTOs mirror every public core
input and result type and map them to and from `scheduler-core`; the service
does not implement scheduling policy.

The service depends on the local editable
`planner-dayflex-scheduler-core` package, FastAPI, and Uvicorn. It uses the
same Python 3.13/uv/Ruff/pytest toolchain pattern as the core, with a committed
service lockfile and a dedicated CI quality job. All HTTP datetimes require an
explicit ISO offset. Schema and core validation errors use one generic 422
envelope so response bodies do not reflect request contents, exception text, or
stack traces.

## Consequences

- Scheduler policy remains deterministic, framework-free, and independently
  testable in `packages/scheduler-core`.
- The future application API has a documented internal scheduler contract but
  remains responsible for browser-facing validation, authorization,
  persistence, and orchestration.
- The service has a liveness health endpoint but no configuration, secrets,
  Docker image, Compose topology, database, queue, AI, or model dependency.
- Introducing any of those dependencies or changing the public contract is a
  new scoped ticket and may require a separate operational ADR.
