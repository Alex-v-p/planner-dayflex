# TKT-029: Move planning inputs into contextual editors

**Status:** Planned
**Depends on:** TKT-016, TKT-027, TKT-028

## Goal

Replace the long stacked task and fixed-event forms with focused contextual
editors that feel like calendar creation flows while preserving the existing
validated API behavior.

## User story

As a user, I can add or adjust flexible tasks and fixed events from the planner
workspace without losing sight of the day I am building.

## Context

The current workspace exposes nearly every input as an always-visible form.
The inspiration references instead keep the calendar surface central and open a
focused editor only when the user chooses to create or inspect an item.

## Scope

- Add clear create/edit entry points for flexible tasks and fixed events from
  the daily workspace shell, date header, or selected time area.
- Move task and fixed-event create/edit/delete interactions into accessible
  drawers, side panels, or modals with predictable focus management.
- Use appropriate controls for the domain: toggles for splitting, steppers or
  numeric inputs for estimates and priority, date/time inputs for constraints,
  and concise status chips for existing values.
- Keep optional AI suggestions available but visually secondary to deterministic
  manual entry and review.
- Preserve unsaved form data across validation errors and recoverable API
  failures.
- Keep task and event lists scannable through compact rows, chips, or sidebar
  summaries rather than full forms.

## Acceptance criteria

- [ ] A user can create, edit, and delete tasks and fixed events from focused
  contextual editors.
- [ ] The calendar schedule remains visible or easy to return to while an item
  is being edited.
- [ ] Validation errors are shown next to the relevant fields and do not discard
  entered details.
- [ ] Optional AI suggestion states remain reviewable and never save changes
  without explicit user action.
- [ ] Existing user isolation, API validation, deletion confirmation, and
  mutation refresh behavior are preserved.
- [ ] Keyboard and screen-reader users can open, complete, cancel, and close
  each editor predictably.

## Non-goals

- Dragging blocks to create events, recurring events, calendar synchronization,
  changing API contracts, or changing scheduler placement rules.

## Data-model impact

None.

## Service and container impact

Browser/API only: reworks Angular interactions over existing planning API
contracts. It adds no new runnable service, Docker image, or Compose topology.

## Risk level

Medium - form relocation can break validation, focus, and mutation feedback.

## Suggested checks

- Component tests for editor open/close, validation, AI suggestion, and mutation
  states.
- Browser flow creating and editing one task and one fixed event.
- Keyboard and focus-trap review for each editor pattern.
