# TKT-011: Generate and save a daily plan

**Status:** Planned
**Depends on:** TKT-007, TKT-010

## Goal

Orchestrate a user’s saved planning inputs through the scheduler service and
persist an immutable, retrievable daily schedule snapshot.

## User story

As a user with tasks and fixed events, I can request a daily plan and return to
the exact result that was generated.

## Scope

- Add an authenticated generate-plan API operation for one planning day.
- Map persisted inputs to the scheduler contract and call the scheduler service.
- Persist schedule snapshots, segments, free-time windows, unscheduled tasks,
  and structured decision reasons.
- Return a stable browser-facing DTO for the latest plan and historical
  snapshots.

## Acceptance criteria

- [ ] A user can generate a plan only for their own planning day.
- [ ] The API persists an immutable snapshot with scheduler version and
  configuration used.
- [ ] The latest snapshot is selected without overwriting previous history.
- [ ] Scheduler validation or availability errors return safe, actionable API
  responses and do not create partial snapshots.
- [ ] The canonical initial-day result persists and reloads accurately.

## Non-goals

- Completion tracking, interruptions, AI enrichment, or cross-day planning.

## Data-model impact

Added: `schedule_snapshots`, `schedule_items`, and `schedule_decisions`, plus
`planning_days.current_snapshot_id` and required foreign keys/indexes.

## Service and container impact

Application API service: owns persistence and calls the scheduler through its
explicit contract. It adds no separately deployable service, Docker image, or
Compose topology.

## Risk level

High — establishes auditable schedule history and a service boundary.

## Suggested checks

- Scheduler-client contract tests.
- Transactional persistence and ownership integration tests.
- Snapshot immutability/retrieval tests.
