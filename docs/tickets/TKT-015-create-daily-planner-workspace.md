# TKT-015: Create the daily planner workspace

**Status:** Planned
**Depends on:** TKT-011, TKT-013, TKT-014

## Goal

Give an authenticated user one calm, responsive daily-planning route that can
load a selected day, show its current state, and make an empty day understandable.

## User story

As a signed-in user, I can open a day in the planner and understand whether I
have inputs, a generated plan, or work still to do.

## Scope

- Add a day-focused planner route and date selection/navigation.
- Load the current user’s planning-day data and latest snapshot through the API.
- Create the page layout regions for day timeline, input list, summary, and
  recovery actions without implementing every interaction yet.
- Add coherent empty, loading, permission, and API-error states.

## Acceptance criteria

- [ ] The workspace never shows another user's data.
- [ ] A user can select/open a planning day and see current inputs/snapshot
  state, including a helpful empty state.
- [ ] The layout works at supported desktop and narrow mobile widths.
- [ ] Loading and error states preserve context and use accessible announcements.
- [ ] Tests cover route/session handling and the main state variants.

## Non-goals

- Creating tasks/events, generating a plan, completion, interruption reporting,
  week/month views, or AI assistance.

## Data-model impact

None.

## Service and container impact

Browser/API only: adds a browser workspace over existing API contracts. It adds
no new runnable service, Docker image, or Compose topology.

## Risk level

Medium.

## Suggested checks

- Responsive component tests.
- Browser smoke test for an empty and an existing planning day.
