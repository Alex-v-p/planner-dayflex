# TKT-028: Rebuild the daily workspace around a time-grid schedule

**Status:** Planned
**Depends on:** TKT-017, TKT-027

## Goal

Make the daily workspace look and behave like a practical calendar day view,
with the schedule as the primary surface instead of a form-heavy page with a
small timeline card.

## User story

As a user, I can scan my day by time, understand fixed commitments and flexible
work at a glance, and see useful free time as part of the schedule.

## Context

The inspiration screenshots emphasize a clear time axis, day/date controls,
colored schedule blocks, and a nearby detail surface. Dayflex should adapt that
structure for deterministic planning and recovery rather than becoming a
generic calendar clone.

## Scope

- Replace the current daily timeline presentation with a central time grid that
  uses day bounds, a visible time ruler, and stable proportional block
  placement.
- Render fixed events, task segments, buffers, interruptions, designated free
  time, and unscheduled/deferred summaries with the shared visual status
  language from TKT-027.
- Add a compact day header with date navigation, today/current-day affordance,
  generate-plan action, and schedule summary values.
- Add a read-only selected-block detail panel or popover for schedule item
  title, type, time range, duration, and deterministic reason details.
- Preserve understandable empty, loading, permission, scheduler-error, and
  no-snapshot states inside the redesigned workspace.
- Provide a narrow-screen layout that keeps the same information usable without
  horizontal overflow.

## Acceptance criteria

- [ ] Schedule blocks align to the visible time ruler and do not visually
  overlap incoherently at supported desktop and mobile widths.
- [ ] Designated free-time windows remain visible as first-class schedule
  results.
- [ ] Fixed events, task work, buffers, interruptions, moved work, completed
  work, and deferred work are distinguishable without color alone.
- [ ] Selecting or focusing a schedule block exposes its details and scheduler
  reason without inventing browser-only scheduling logic.
- [ ] The canonical initial day renders in the new workspace with accurate
  times, duration labels, and summary values.
- [ ] Loading, empty, error, and permission states keep the selected date and
  primary navigation visible.

## Non-goals

- Drag-and-drop rescheduling, editing schedule segments directly, week/month
  redesign, new scheduling rules, or AI-authored explanations.

## Data-model impact

None.

## Service and container impact

Browser only: presents existing API and scheduler result data in a redesigned
Angular workspace. It adds no new runnable service, Docker image, or Compose
topology.

## Risk level

High - the daily schedule is the core comprehension surface for the product.

## Suggested checks

- Component tests for canonical-day timeline placement and block detail states.
- Playwright smoke at desktop, tablet, and mobile widths.
- Accessibility scan plus keyboard review for block focus and detail panel
  behavior.
