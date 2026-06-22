# TKT-019: Add week and month overviews

**Status:** Planned
**Depends on:** TKT-011, TKT-015

## Goal

Let users scan saved daily plans across a week or month without turning the MVP
into a multi-day optimization engine.

## User story

As a user, I can see which days have scheduled work, fixed commitments,
interruptions, deferred work, and free time before opening a specific day.

## Scope

- Add API summary queries built from saved planning-day/snapshot data.
- Add accessible week and month overview surfaces with day navigation.
- Show concise daily indicators for planned minutes, fixed-event count,
  interruption time, unscheduled count, and useful free-time presence.
- Link each summary back to its day workspace.

## Acceptance criteria

- [ ] Summaries are derived from stored daily snapshots and user-owned inputs.
- [ ] No overview invokes or implies cross-day scheduling optimization.
- [ ] A user can navigate from a summary day to its detailed workspace.
- [ ] Empty/incomplete days are represented clearly.
- [ ] API and UI tests cover week/month boundaries and user isolation.

## Non-goals

- Dragging work between days, calendar synchronization, recurrence, or a
  cross-day scheduler.

## Data-model impact

None; adds queries/DTOs over existing planning and snapshot data.

## Service and container impact

Browser/API only: adds API queries and browser summaries over existing saved
daily data. It adds no new runnable service, Docker image, or Compose topology.

## Risk level

Medium.

## Suggested checks

- Date-boundary and time-zone summary tests.
- Responsive month-grid and keyboard-navigation tests.
