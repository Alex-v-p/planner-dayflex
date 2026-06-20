# TKT-005: Add interruption-aware rescheduling

**Status:** Planned
**Depends on:** TKT-004

## Goal

Recalculate unfinished work after lost time while preserving completed progress
and returning a transparent account of what changed.

## User story

As a planner user whose day was interrupted, I need an updated remaining-day
plan without having to rebuild all tasks and commitments myself.

## Scope

- Accept existing schedule results, current time, task progress, and new
  interruption blocks.
- Preserve completed segments as history and reconsider only unfinished work.
- Union overlapping locked time without double-counting unavailable minutes.
- Replan remaining work using the daily scheduling policy.
- Mark moved, deferred, and unscheduled work with stable reason codes.

## Acceptance criteria

- [ ] The canonical-day initial and revised results pass as exact fixtures.
- [ ] Completed work remains preserved and is not scheduled again.
- [ ] Interrupted unfinished work is either replanned, deferred, or returned
  unscheduled with a reason.
- [ ] Fixed events remain locked during rescheduling.
- [ ] An interruption that overlaps a fixed event produces the documented
  warning and does not reduce availability twice.
- [ ] Repeated rescheduling with the same inputs remains deterministic.

## Non-goals

- Persisting snapshots, background jobs, AI explanations, or a browser flow.

## Data-model impact

None; progress and interruption models remain scheduler input only.

## Risk level

High — this is the central recovery promise.

## Suggested checks

- Canonical-day fixture tests.
- Partial completion, late current-time, deadline, and no-fit cases.
