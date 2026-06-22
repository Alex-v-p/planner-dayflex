# TKT-024: Add the non-critical background worker

**Status:** Planned
**Depends on:** TKT-022, TKT-023

## Goal

Move optional slow enrichment and cleanup work into an idempotent background
worker without making planning or interruption recovery depend on it.

## User story

As a user, I receive optional enrichment when available, but my plan still
updates immediately if background processing is delayed or unavailable.

## Scope

- Create `services/worker/` and choose/document a Redis-backed queue library.
- Define typed job payloads, idempotency keys, retry policy, and failure logs.
- Move suitable non-critical AI enrichment/explanation work and one cleanup task
  behind the worker boundary.
- Keep API response paths synchronous for generate-plan and reschedule actions.

## Acceptance criteria

- [ ] A test job can be enqueued, consumed once, and observed safely.
- [ ] Duplicate delivery does not repeat externally visible effects.
- [ ] Retryable and permanent failures are distinguishable and logged safely.
- [ ] Scheduler/recovery API tests pass when the queue/worker is unavailable.
- [ ] Job contracts remain explicit and versioned with the producing service.

## Non-goals

- Reminders, analytics, mandatory AI work, or moving immediate rescheduling to
  an asynchronous process.

## Data-model impact

None by default; document a separate migration if durable job/audit storage is
introduced.

## Service and container impact

Worker runtime: introduces a separate non-critical worker with explicit queue
job contracts. Container packaging and local Compose topology are deferred to
TKT-025; the worker must not become a dependency of synchronous planning or
recovery paths.

## Risk level

Medium.

## Suggested checks

- Worker integration test with a test Redis instance.
- Idempotency, retry, and “worker unavailable” API tests.
