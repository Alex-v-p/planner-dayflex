# TKT-027: Establish a calendar-style shell and visual system

**Status:** Planned
**Depends on:** TKT-021

## Goal

Replace the generic MVP page frame with a cohesive calendar-app shell and
shared visual language that can support the day, week, month, and recovery
flows without widening product scope.

## User story

As a user, I can open Dayflex and immediately recognize where I am, what date
or view I am looking at, and which planner actions are available.

## Context

Use `docs/design/inspiration/catalog.md` and the local references in
`docs/design/inspiration/screenshots/` for direction. Borrow the calendar-app
structure: persistent navigation, compact date controls, segmented view
switching, icon-led actions, clear status treatment, and dense but readable
surfaces. Do not copy branding, exact layouts, personal data, or visual assets.

## Scope

- Redesign the application shell from a top header plus centered cards into a
  planner-oriented frame with desktop sidebar navigation and a compact mobile
  alternative.
- Add consistent route navigation, active states, account controls, and
  day/week/month/free-time entry points.
- Introduce shared visual primitives for segmented controls, icon buttons,
  status chips, compact summary values, and block type markers.
- Define accessible status treatments for task work, fixed events,
  interruptions, buffers, designated free time, completed work, moved work, and
  deferred work.
- Apply the shell and shared primitives to existing authenticated planner
  routes without changing scheduler or API behavior.

## Acceptance criteria

- [ ] Authenticated planner routes use a consistent calendar-style shell with
  responsive desktop and mobile navigation.
- [ ] Day, week, month, and free-time routes have a shared view-switching and
  date-navigation vocabulary.
- [ ] Shared status treatments are documented in code or design guidance and
  do not rely on color alone.
- [ ] The palette, spacing, typography, and interaction states feel coherent
  across planner routes and avoid a one-note color theme.
- [ ] Existing route guards, account actions, skip links, and focus behavior
  continue to work.
- [ ] The ticket references the relevant inspiration catalog entries in its PR
  summary.

## Non-goals

- Rebuilding the day timeline, redesigning forms, changing authentication,
  changing scheduler behavior, adding calendar synchronization, or adding a
  full design-system package without a scoped implementation reason.

## Data-model impact

None.

## Service and container impact

Browser only: changes shared Angular layout and presentation primitives. It
adds no new runnable service, Docker image, or Compose topology.

## Risk level

Medium - cross-route layout changes can regress navigation and accessibility.

## Suggested checks

- Component tests for shell navigation and active route states.
- Keyboard/focus review at desktop and mobile widths.
- Browser smoke covering sign-in, planner, week, month, and free-time routes.
