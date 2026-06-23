# TKT-007: Expose the scheduler service contract

**Status:** In progress
**Depends on:** TKT-006

## Goal

Wrap the tested scheduler core in a narrow HTTP service without giving it
persistence, queue, AI, or browser responsibilities.

## User story

As the application API, I need a stable way to request initial plans and
reschedules from the deterministic engine.

## Scope

- Create `services/scheduler/` only as a thin transport boundary around
  `packages/scheduler-core/`.
- Add health, schedule-day, and reschedule-day endpoints with explicit request
  and response contracts.
- Map validation failures to safe client errors and preserve decision codes.
- Add HTTP contract and service-level tests.

## Acceptance criteria

- [ ] Health, initial-schedule, and reschedule endpoints are documented and
  tested.
- [ ] The service delegates scheduling decisions to the core package.
- [ ] It has no database, Redis, worker, AI, or model dependency.
- [ ] Invalid request payloads return validation errors without a server crash.
- [ ] Contract tests include the canonical-day scenario.

## Non-goals

- User authentication, persistence, browser-facing API, Compose, or deployment.

## Implementation plan and structural rationale

1. Create `services/scheduler/` as the minimal ASGI transport package with
   explicit Pydantic contracts for all scheduler-core inputs and outputs.
2. Delegate initial planning and recovery unchanged to the public
   `scheduler_core.schedule` and `scheduler_core.reschedule` functions, and
   translate schema/core validation failures to one safe 422 envelope.
3. Add service-level HTTP and architecture-guard tests, then run them in a
   dedicated scheduler-service CI quality job.

`packages/scheduler-core/` was considered as the implementation location, but
it must remain framework-free and independently testable. The approved
`services/scheduler/` location is owned solely by the scheduler transport
boundary, matching the repository-structure guide. It imports only the core's
public contracts and functions; no existing core imports move and no caller
migration is required yet. The service tests prove DTO-to-core mapping,
canonical initial and recovery behavior, safe failures, and the absence of
database, queue, AI, and model-client imports.

## Data-model impact

None. No tables, fields, constraints, migrations, backfills, or rollback work
are introduced.

## Service and container impact

Scheduler service contract: this ticket defines the scheduler-owned HTTP
boundary and explicit contracts around the pure core package. Container
packaging and Compose topology are deferred; it adds no Docker image or Compose
service. There is no service configuration or secret source in this increment.
`GET /health` is process liveness only; Docker/Compose, network exposure, and
dependency health checks are deferred until a separately scoped operational
ticket.

## Risk level

Medium.

## Suggested checks

- HTTP contract tests for valid and invalid payloads.
- Architecture test or review confirming no forbidden infrastructure imports.
