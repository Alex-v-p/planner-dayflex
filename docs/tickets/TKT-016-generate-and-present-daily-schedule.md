# TKT-016: Generate and present the daily schedule

**Status:** Planned
**Depends on:** TKT-010, TKT-015

## Goal

Turn saved planning inputs into a clear daily timeline with schedule summary,
decision reasons, unscheduled work, buffers, and useful free time.

## User story

As a user, I can generate my day and see exactly what is planned, what remains
free, and what did not fit.

## Scope

- Add a generate-plan action with safe pending/error behavior.
- Render fixed events, task segments, buffers, interruptions when present,
  designated free time, and unscheduled tasks in an accessible timeline.
- Present a compact summary of scheduled, free, and deferred work.
- Render structured scheduler reasons as calm, factual explanations.

## Acceptance criteria

- [ ] Generating a valid day displays the latest persisted snapshot.
- [ ] Timeline blocks are positioned without visual overlap and include
  non-color cues for their type/status.
- [ ] Free-time windows and unscheduled tasks are visible, not hidden.
- [ ] Reason text corresponds to scheduler decision codes rather than invented
  browser logic.
- [ ] Loading, no-fit, and scheduler-error states are understandable.
- [ ] Tests cover the canonical initial day and critical presentation states.

## Non-goals

- Editing existing schedule segments by drag-and-drop, interruption reporting,
  week/month views, or AI-written explanations.

## Data-model impact

None.

## Risk level

High — the core plan must be understandable, not merely generated.

## Suggested checks

- Visual/regression checks for timeline collision and narrow screens.
- Browser flow for generate-plan and no-fit outcomes.
