# TKT-007: Expose the scheduler service contract

**Status:** Planned
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

## Data-model impact

None.

## Service and container impact

Scheduler service contract: this ticket defines the scheduler-owned HTTP
boundary and explicit contracts around the pure core package. Container
packaging and Compose topology are deferred; it adds no Docker image or Compose
service.

## Risk level

Medium.

## Suggested checks

- HTTP contract tests for valid and invalid payloads.
- Architecture test or review confirming no forbidden infrastructure imports.
