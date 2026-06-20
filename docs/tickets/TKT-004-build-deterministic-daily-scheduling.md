# TKT-004: Build deterministic daily scheduling

**Status:** Planned
**Depends on:** TKT-003

## Goal

Generate a deterministic day plan from fixed events and flexible tasks,
including task ordering, buffers, splitting, and designated free time.

## User story

As a planner user, I need a realistic, conflict-free proposed day that explains
which work fit and which work did not.

## Scope

- Derive locked intervals and available windows for one planning day.
- Apply the versioned priority/deadline/stable-order policy.
- Place whole tasks in the earliest valid window and split only allowed tasks.
- Apply buffer and useful-free-time rules from scheduler decisions.
- Return scheduled segments, free windows, unscheduled work, and structured
  decision reasons.

## Acceptance criteria

- [ ] Fixed events and task segments never overlap.
- [ ] Equal inputs and configuration produce equal ordered results.
- [ ] Priority, deadline, duration, and stable tie-breaking follow the policy.
- [ ] Splitting, buffers, and free-time thresholds follow the documented
  defaults.
- [ ] Tasks that do not fit return an appropriate reason rather than vanishing.
- [ ] Unit tests cover placement, no-fit, buffer, free-time, and split cases.

## Non-goals

- Interruption rescheduling, persistence, HTTP, AI, or multi-day planning.

## Data-model impact

None.

## Risk level

High — this is the core product algorithm.

## Suggested checks

- Property-style overlap/determinism tests where practical.
- Exact expected-output tests for simple daily plans.
