# TKT-031: Redesign week, month, and free-time summary surfaces

**Status:** Planned
**Depends on:** TKT-019, TKT-020, TKT-027

## Goal

Make saved-plan summaries feel like useful calendar overviews instead of large
stat cards, while preserving the MVP rule that week and month views summarize
daily snapshots rather than optimizing across days.

## User story

As a user, I can scan a week or month, spot days with plans, interruptions,
deferred work, and free time, and open the day that needs attention.

## Context

The month and week inspiration references pair dense calendar grids with
sidebar agendas, filters, selected-day emphasis, and compact event indicators.
Dayflex should use those patterns to summarize saved daily plans, not to add
calendar sync or cross-day scheduling.

## Scope

- Redesign the week and month overview routes as calendar grids with compact
  day cells, selected-day emphasis, and clear route back to the daily workspace.
- Add a summary sidebar or responsive equivalent for the selected range/day,
  including planned work, fixed events, interruptions, deferred count, and
  useful free-time presence.
- Use concise indicators for saved inputs, generated snapshots, interruptions,
  deferred work, and useful free time without relying on color alone.
- Align date navigation and day/week/month switching with the shared shell from
  TKT-027.
- Redesign the free-time finder results so useful windows are grouped by date
  and easy to compare against saved plan context.
- Keep no-generated-plan and no-useful-free-time states honest and distinct.

## Acceptance criteria

- [ ] Week and month summaries are scannable as calendar overviews at supported
  desktop and mobile widths.
- [ ] Each planned day exposes meaningful indicators and links back to its
  daily workspace.
- [ ] No overview invokes, implies, or stores cross-day optimization.
- [ ] Free-time finder results identify date, time, duration, source snapshot,
  and route back to the day without exposing confusing internal IDs as primary
  content.
- [ ] Empty, no-generated-plan, and no-useful-free-time states remain distinct.
- [ ] The relevant inspiration catalog entries are cited in the PR summary.

## Non-goals

- Dragging work between days, calendar synchronization, recurrence, heat-map
  analytics as an MVP feature, or new summary API data beyond existing saved
  daily snapshots and free-time windows.

## Data-model impact

None.

## Service and container impact

Browser/API only: redesigns Angular summaries over existing overview and
free-time API contracts. It adds no new runnable service, Docker image, or
Compose topology.

## Risk level

Medium - summaries must stay useful without suggesting unsupported planning
behavior.

## Suggested checks

- Component tests for week/month cells, selected-day summaries, and empty
  states.
- Browser smoke navigating from summary and free-time results back to a day.
- Responsive review at desktop, tablet, and narrow mobile widths.
