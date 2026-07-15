# Component boundary rules

Planner UI work should stay modular enough that later redesign tickets can
change presentation without untangling business logic from layout.

## Shell, header, footer, and body

- The application shell owns persistent page structure: skip link, global
  navigation, account controls, route frame, and any app-wide header or footer.
- Route bodies own feature content: daily workspace, week overview, month
  overview, free-time finder, authentication forms, and route-specific status.
- A route header belongs to the route body when it changes with the selected
  date, active view, or feature workflow.
- A footer belongs to the shell only when it is global. Do not add route-only
  actions to a global footer.
- The shell must not own planner business state, scheduler calculations,
  feature form data, or route-specific mutation behavior.
- Feature bodies should not duplicate global navigation or account actions.

## Shared UI components

- Put generic presentational primitives under `apps/web/src/app/shared/ui/`.
- Put feature-specific components inside the owning feature until at least two
  independent features need them.
- Shared components should accept explicit inputs and emit events; they should
  not call planner APIs or read authentication state directly.
- Keep API DTO mapping in feature or contract layers, not inside generic UI
  primitives.
- Prefer composition over large configurable components with many unrelated
  modes.

## Planner feature ownership

- `features/planner` owns the daily workspace, schedule time grid, recovery
  actions, schedule block details, and day-level summaries.
- `features/free-times` owns free-time search and result comparison.
- Week and month overview components belong with the planner summary feature
  unless a later ticket extracts a separate schedules feature.
- `core/shell` owns only persistent framing and navigation.
- `core/auth` owns session state and route access; visual auth pages should not
  duplicate auth service logic.

## State and data flow

- Keep deterministic scheduler facts separate from display labels. UI prose may
  explain API decision codes, but it must not invent a different reason.
- Keep forms, view models, and API DTOs distinct when validation or mapping is
  non-trivial.
- Keep mutation feedback close to the action that triggered it and preserve the
  selected date or route context.
- Do not let a visual redesign change persistence, scheduler behavior, or API
  contracts unless the ticket explicitly scopes that change.

## Review triggers

Treat these as defects, not taste differences:

- Shell components containing feature business logic.
- Feature pages duplicating global navigation or account controls.
- A new visual pattern that bypasses existing reusable primitives without a
  clear reason.
- Color-only schedule status.
- Route layouts where text, controls, or schedule blocks overlap at supported
  widths.
- UI copy that blames the user for moved, missed, or deferred work.
