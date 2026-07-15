# TKT-013: Establish the web application foundation

**Status:** Planned
**Depends on:** TKT-001

## Goal

Create the smallest maintainable browser application foundation for the planner
without attempting the day-planning experience in the same ticket.

## User story

As a developer, I need a responsive web shell, API client boundary, and
reusable UI conventions so feature tickets do not invent their own structure.

## Scope

- Confirm the selected web runtime/tooling and document its commands.
- Create `apps/web/` using the feature-oriented structure guide.
- Add environment-driven API configuration, routing, an application shell, and
  a minimal reusable form/button/feedback baseline.
- Establish responsive and accessibility conventions informed by the local
  inspiration catalog without copying its visuals.

## Acceptance criteria

- [ ] The web app builds, formats, lints, and runs its starter tests locally.
- [ ] API base URL and environment settings are not hard-coded.
- [ ] The shell has accessible navigation, a responsive layout baseline, and
  safe loading/error presentation primitives.
- [ ] Browser code has no direct database, scheduler, AI, or model access.
- [ ] No planner, authentication, or feature-specific screen is implemented.

## Non-goals

- Authentication UI, task/event forms, planner timeline, or production styling
  polish.

## Data-model impact

None.

## Service and container impact

Browser/API only: establishes the browser client and its API boundary without a
new runnable service, Docker image, or Compose topology.

## Risk level

Medium.

## Suggested checks

- Build, lint, unit test, and desktop/mobile smoke render.
- Accessibility check for shell navigation and focus order.
