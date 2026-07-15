# UI/UX rules

These rules apply to planner-dayflex visual interface work. They are not a
replacement for ticket acceptance criteria; they are the baseline quality bar
for implementing those criteria.

Use this file with `docs/design/component-boundaries.md`. For calendar-style
planner work, also use `docs/design/calendar-interface-workflow.md`; for
testing or review, use `docs/design/visual-qa-workflow.md`. If a ticket cites
visual inspiration, consult `docs/design/inspiration/catalog.md`.

## Consistent reusable style

- Use the shared design tokens and Tailwind theme before adding one-off colors,
  spacing, shadows, or typography.
- Prefer a small vocabulary of reusable primitives: shell navigation, view
  switchers, icon buttons, action buttons, text fields, segmented controls,
  status chips, schedule blocks, summary metrics, empty states, and dialogs or
  drawers.
- Add a new primitive only when at least two screens need the behavior or the
  component expresses a stable planner concept.
- Keep palette usage balanced. The app should not read as a single-hue theme,
  and schedule status must never depend on color alone.
- Keep text density appropriate to the surface. Calendar grids, sidebars, and
  cards should use compact headings and labels rather than hero-scale type.

## Calendar-like information hierarchy

- Make the current date, active view, and primary schedule surface obvious.
- Put the schedule or overview grid at the center of planner routes; forms and
  explanations support the schedule rather than replacing it.
- Use consistent day/week/month/free-time navigation across planner surfaces.
- Represent fixed events, flexible work, interruptions, buffers, free time,
  moved work, completed work, and deferred work with stable labels and
  non-color cues.
- Keep free time visible as a useful result, not empty background space.

## UX best practices

- Keep primary actions close to the object they affect.
- Make destructive actions explicit and confirm when data can be removed.
- Preserve user-entered form data across validation errors and recoverable API
  failures.
- Separate empty, loading, permission, validation, network-error, and retry
  states.
- Use calm, practical language for deferrals, missed work, and recovery.
- Keep optional AI suggestions visually secondary and require explicit user
  review before applying them.

## Accessibility and responsiveness

- Every interactive control must have a visible label or accessible name.
- Keyboard users must be able to reach, operate, and leave every control,
  popover, dialog, drawer, and schedule block detail.
- Focus must remain visible and predictable after navigation, mutation,
  validation error, and dialog open or close.
- Use non-color indicators such as icons, text labels, borders, patterns, or
  grouped summaries for important status.
- Supported mobile and desktop widths must not create text overflow, clipped
  controls, incoherent overlap, or hidden primary actions.
- Announce meaningful schedule and recovery updates through accessible status
  regions where appropriate.

## Visual QA expectations

- UI tickets should name the desktop and mobile widths used for review.
- Calendar grids and time-grid schedules need explicit overlap and empty-state
  checks.
- New or changed reusable primitives need focused component tests.
- User-facing route changes need at least one browser smoke path when the local
  toolchain supports it.
