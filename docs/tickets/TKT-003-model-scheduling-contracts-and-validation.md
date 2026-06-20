# TKT-003: Model scheduling contracts and validation

**Status:** Planned
**Depends on:** TKT-002

## Goal

Define typed, framework-free scheduler inputs, outputs, configuration, and
validation that make the decisions in the canonical day executable.

## User story

As a future API or UI caller, I need invalid planning input rejected clearly and
a stable result contract before scheduling algorithms begin placing work.

## Scope

- Implement domain models for planning days, time intervals, fixed events,
  flexible tasks, interruption blocks, task progress, configuration, and
  schedule results.
- Enforce the documented time-zone, half-open interval, priority, splitting,
  and valid-duration rules.
- Define structured decision/warning types needed by later placement and
  rescheduling work.

## Acceptance criteria

- [ ] Every public request/result model is framework-free and type validated.
- [ ] Invalid or ambiguous local times, reversed intervals, invalid priorities,
  and bad split configuration produce clear validation errors.
- [ ] Overlapping fixed events are rejected; interruption/fixed-event overlap
  can be represented for later unioning with a warning.
- [ ] The canonical day can be expressed entirely through the new models.
- [ ] Tests cover valid construction and the important validation failures.

## Non-goals

- Placing tasks, HTTP serialization, database models, or user-facing prose.

## Data-model impact

None; these are in-memory scheduler contracts.

## Risk level

Medium — contract mistakes would ripple into later layers.

## Suggested checks

- Unit tests for interval semantics and time-zone handling.
- Validation tests for priority, task duration, and split constraints.
