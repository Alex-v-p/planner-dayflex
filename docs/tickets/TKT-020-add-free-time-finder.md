# TKT-020: Add the free-time finder

**Status:** Planned
**Depends on:** TKT-011, TKT-019

## Goal

Make designated free-time windows easy to find and filter across saved daily
plans without scheduling new work automatically.

## User story

As a user, I can answer “when do I have a useful block of time?” from the plans
I have already generated.

## Scope

- Add user-scoped API queries over persisted designated free-time items.
- Add a focused free-time view with date range and minimum-duration filters.
- Link results back to daily plans and make the source snapshot/date visible.
- Handle days without snapshots or useful free windows honestly.

## Acceptance criteria

- [ ] Results come only from persisted scheduler-designated free-time windows.
- [ ] Filters are validated and scoped to the authenticated user.
- [ ] A result identifies its day, start/end, duration, and route back to the
  source plan.
- [ ] Empty and loading states distinguish “no generated plan” from “no useful
  free time.”
- [ ] API/UI tests cover filtering and no-result states.

## Non-goals

- Searching third-party calendars, automatically booking time, or cross-day
  optimization.

## Data-model impact

None; queries existing schedule-item/free-time data.

## Service and container impact

Browser/API only: adds an API query and browser results over existing
scheduler-designated free time. It adds no new runnable service, Docker image,
or Compose topology.

## Risk level

Medium.

## Suggested checks

- Range/minimum-duration API tests.
- Browser test navigating a result back to its daily workspace.
