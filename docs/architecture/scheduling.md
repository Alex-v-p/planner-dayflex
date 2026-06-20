# Scheduling design

## Role

The scheduler turns structured daily inputs into an explainable plan. It is the
decision-making core of `planner-dayflex`, so it must produce the same output
for the same input and configuration.

The scheduler is responsible for placing flexible work, finding usable free
time, and explaining trade-offs. It is not responsible for persistence, UI
state, natural-language interpretation, or randomly choosing a plan.

## Inputs

The scheduling request needs explicit day bounds and current time, plus:

- Fixed events and interruption blocks, which are locked intervals.
- Flexible tasks, including an estimate, priority, stable identifier, and
  creation order for tie-breaking.
- Optional deadline, earliest start, splitting permission, and minimum useful
  segment length.
- Completed work and any existing plan items that should remain preserved.
- Configuration such as buffer time, minimum free-time duration, and maximum
  task segments.

All times must be normalized before interval comparison. Validation must reject
invalid intervals and report conflicting locked inputs instead of silently
guessing.

## Result

A result contains:

- Scheduled task segments.
- Designated free-time windows.
- Tasks that were deferred or could not fit.
- Tasks or segments that moved after replanning.
- Warnings and structured decision reasons.

Useful reason codes include conflicts with locked time, a passed current time,
deadline pressure, insufficient remaining duration, an earliest viable slot,
and an allowed split across windows. User-facing prose should be generated from
these facts, not substituted for them.

## Initial deterministic strategy

The first strategy should be explicit and configurable, for example
`priority_first_with_deadlines`. A safe daily planning flow is:

1. Validate and normalize the request.
2. Form locked intervals from fixed events, interruptions, and preserved
   completed work.
3. Discard incomplete plan segments that are no longer valid after the current
   time or an interruption.
4. Derive free windows between locked intervals.
5. Order pending tasks by priority, deadline, size, and a stable tie-breaker.
6. Place each task in the earliest valid window; divide it only when its rules
   allow a useful segment.
7. Reserve configured buffer time where appropriate.
8. Classify remaining useful windows as designated free time.
9. Return all decisions without mutating external state.

Possible future strategies must be named configuration choices and tested as
such; they must not quietly change user expectations.

## MVP limits

The engine schedules one day. Week and month views summarize saved daily
results; they must not cause hidden multi-day optimization in the MVP. AI may
suggest structured inputs or make reasons friendlier, but cannot override the
scheduler's constraints or final result.
