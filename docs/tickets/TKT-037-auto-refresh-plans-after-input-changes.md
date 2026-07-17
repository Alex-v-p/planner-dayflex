# TKT-037: Auto-refresh plans after input changes

**Status:** Planned
**Depends on:** TKT-011, TKT-012, TKT-016, TKT-018, TKT-034

## Goal

Stop making users manually run the planner after routine input changes by
automatically recalculating the current day when events, tasks, progress, or
interruptions change.

## User story

As a user, when I create or change an event, task, progress record, or
interruption for the current day, the visible plan updates on its own and tells
me what changed.

## Context

Manual "generate plan" actions are useful for an early MVP, but they make the
calendar feel unlike a calendar and force users to understand implementation
steps. The product promise is that the plan responds when the day changes.
Automatic recalculation should happen through the application API so validation,
persistence, authorization, and snapshot history stay server-owned.

## Scope

- Identify planning mutations that should trigger a new current-day schedule:
  fixed-event create/update/delete, relevant task create/update/delete, progress
  recording, and interruption reporting.
- Move the default orchestration to the application API where practical: save
  the mutation, call the scheduler synchronously for the affected planning day,
  persist a new immutable snapshot, and return the updated current plan.
- Keep explicit "Run plan" or "Refresh plan" as a secondary recovery action for
  retrying after failures or generating a plan when no prior snapshot exists.
- Display clear pending, success, validation-error, scheduler-error, and retry
  states in the calendar UI without requiring a page reload.
- Avoid duplicate snapshots for no-op submissions or duplicate retries where
  the existing API supports idempotency; otherwise document the chosen safe
  behavior before implementation.
- Preserve historical snapshots and never overwrite prior plans.
- Keep AI and background workers out of the critical path for immediate
  recalculation.

## Acceptance criteria

- [ ] Creating, editing, or deleting a fixed event for the selected day updates
  the visible current plan without a separate manual generate action.
- [ ] Creating or editing a task that affects the selected day updates the
  visible current plan or clearly explains why the task is not part of that
  day.
- [ ] Recording progress or an interruption updates the visible current plan
  through the synchronous recovery path.
- [ ] Scheduler or validation failures do not create partial snapshots and give
  the user a clear retry path.
- [ ] Snapshot history remains immutable and the planning day points at the new
  current snapshot after successful recalculation.
- [ ] Automated tests prove AI disabled/unavailable states do not block
  automatic recalculation.

## Non-goals

- Background-only scheduling, advanced notifications, cross-day optimization,
  external calendar sync, recurring events, changing scheduler placement rules,
  or deleting historical snapshots.

## Data-model impact

None expected. This uses existing `planning_days.current_snapshot_id`,
`schedule_snapshots`, `schedule_items`, and `schedule_decisions`. If no-op
deduplication requires new idempotency metadata, split or amend the ticket
before changing persistence.

## Service and container impact

Application API plus browser: the API owns mutation orchestration and scheduler
calls; the browser displays returned plan updates and retry states. It adds no
new runnable service, Docker image, or Compose topology.

## Risk level

High - this changes core orchestration and can create confusing snapshot churn
or stale UI if not tested carefully.

## Suggested checks

- API integration tests for fixed-event, task, progress, and interruption
  mutations triggering current-snapshot updates.
- Transaction tests proving failed scheduler calls do not persist partial
  snapshots or lose the original current snapshot.
- Browser flows proving the calendar updates after create/edit/delete without a
  separate manual generate action.
- Regression tests showing disabled AI and absent workers do not affect the
  synchronous update path.
