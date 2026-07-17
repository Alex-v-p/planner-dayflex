# TKT-033: Add a calendar mode switcher and week time grid

**Status:** Planned
**Depends on:** TKT-027, TKT-028, TKT-031

## Goal

Make the planner feel like a familiar calendar workspace by giving day, week,
and month views one compact mode switcher and by making the week view a timed
calendar grid instead of a loose summary page.

## User story

As a user, I can switch between day, week, and month from the calendar header
and see my week laid out on a timeline with days as columns and hours as rows.

## Context

The current redesign tickets move toward a calendar-style interface, but the
latest product feedback is more specific: the app should feel closer to a
calendar app, with a visible timeline and a simple Day/Week/Month selector
rather than separate menu-heavy pages. The user-supplied reference is a light
Google Calendar week screen. Borrow the information hierarchy and interaction
expectations, not Google branding, exact spacing, icons, labels, or assets.

This ticket keeps the MVP boundary intact. Week and month views summarize saved
daily plans and inputs; they must not perform hidden multi-day optimization.

## Scope

- Replace any fragmented day/week/month navigation with one compact calendar
  mode switcher in the authenticated planner route header.
- Support day, week, and month choices from the same control, using a dropdown
  or segmented/dropdown hybrid that works at desktop and mobile widths.
- Rebuild the week route as a timed week grid with a visible time ruler, day
  columns, selected-day emphasis, timezone label, current-time indicator when
  applicable, and proportional schedule block placement.
- Render fixed events, flexible work, interruptions, buffers, useful free time,
  moved work, completed work, and deferred indicators in the week grid using
  the shared status language from TKT-027.
- Keep the month route as a dense month grid with selected-day and saved-plan
  indicators from TKT-031.
- Preserve direct routes and deep links for day, week, and month so navigation,
  refresh, and browser history remain predictable.
- Provide empty, loading, no-plan, permission, and error states that keep the
  selected date, active mode, and primary calendar surface visible.

## Acceptance criteria

- [ ] Day, week, and month planner views share one obvious mode switcher in the
  route header.
- [ ] The week view uses an hour-based timeline with one column per day and
  non-overlapping schedule blocks placed by time.
- [ ] The active date, visible range, active mode, and timezone are clear
  without opening another menu.
- [ ] Fixed events, flexible work, interruptions, buffers, useful free time,
  moved work, completed work, and deferred indicators are distinguishable
  without relying on color alone.
- [ ] Week and month views summarize saved daily plans only and do not imply
  cross-day optimization or drag-between-days scheduling.
- [ ] Desktop, tablet, and narrow mobile layouts avoid incoherent overlap,
  clipped controls, and hidden primary calendar actions.

## Non-goals

- External calendar synchronization, copying Google Calendar branding, dragging
  work between days, recurring events, cross-day scheduling, or changing
  scheduler rules.

## Data-model impact

None. This ticket presents existing daily inputs and saved schedule snapshots.

## Service and container impact

Browser/API only: changes Angular route structure, navigation, and presentation
over existing planner and summary API data. It adds no new runnable service,
Docker image, or Compose topology.

## Risk level

High - this changes the primary planner navigation and the week surface users
will judge as the app's calendar experience.

## Suggested checks

- Component tests for the calendar mode switcher and active route/date states.
- Browser smoke for day, week, and month navigation with deep links and browser
  back/forward behavior.
- Visual QA at 360px, 768px, and 1280px for week-grid overlap, text fit,
  current-time marker placement, and focus visibility.
