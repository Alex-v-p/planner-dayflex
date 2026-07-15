# Skill: Calendar interface workflow

Use this workflow when a ticket changes the daily workspace, week or month
overview, free-time finder, route shell, planner navigation, or schedule block
presentation.

## 1. Establish the user task

- Identify the primary user question for the screen: planning today, recovering
  after interruption, scanning summaries, or finding free time.
- Keep the primary question visible in the page hierarchy.
- Name the selected date, active view, and relevant schedule snapshot state.

## 2. Choose the surface structure

- Use the shell for persistent navigation and account controls.
- Use a route header for date navigation, view switching, and route-level
  primary actions.
- Use the route body for the main schedule, calendar grid, or result list.
- Use sidebars, drawers, popovers, or dialogs for supporting details and
  editors.
- Keep first-screen content useful. Do not replace app workflows with landing
  page copy.

## 3. Compose from reusable parts

- Start with existing primitives in `shared/ui`.
- Add feature components when a concept is specific to planner behavior, such
  as a schedule block or recovery summary.
- Extract a shared primitive only after the concept is stable across routes.
- Keep class names and token usage consistent with the Tailwind theme.

## 4. Preserve scheduler truth

- Render times, durations, item kinds, completion, moved/deferred status, and
  reasons from API or scheduler data.
- Use copy helpers to translate decision codes into calm prose.
- Do not calculate new scheduling decisions in the browser for visual
  convenience.

## 5. Design state coverage

Cover these states before calling a UI ticket complete:

- Empty day or empty summary range.
- Loading with selected date still visible.
- Permission or expired session.
- API validation error.
- Network or scheduler failure with retry.
- Successful mutation.
- No generated plan.
- No useful free time.
- Revised plan after interruption.

## 6. Check the result

- Review desktop, tablet, and narrow mobile widths.
- Tab through the route and any dialog, drawer, or popover.
- Confirm important status is not color-only.
- Confirm text fits inside buttons, chips, cards, schedule blocks, and grid
  cells.
- Confirm the route still satisfies its ticket acceptance criteria and does not
  add unscheduled product behavior.
