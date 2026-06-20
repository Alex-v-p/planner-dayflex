# TKT-015: Manage tasks and fixed events in the web app

**Status:** Planned
**Depends on:** TKT-009, TKT-014

## Goal

Let users create and manage the two planning inputs—flexible tasks and fixed
events—without mixing schedule-generation behavior into the forms.

## User story

As a user, I can enter the commitments and work that make up my day with clear
validation and see those inputs reflected in the daily workspace.

## Scope

- Add accessible task and fixed-event create/edit/delete interactions.
- Support estimates, priority, due date, earliest start, and split permission
  for tasks; support time-zone-aware start/end for events.
- Refresh the workspace after mutations and surface API validation safely.
- Keep form state, browser view models, and API DTOs distinct.

## Acceptance criteria

- [ ] A user can manage only their own tasks and events from the workspace.
- [ ] Forms enforce required fields and display server validation inline.
- [ ] Invalid intervals, priorities, and split settings cannot be silently sent
  or accepted.
- [ ] Mutations update the visible day without a full page reload.
- [ ] Tests cover form validation, successful edits, deletion confirmation, and
  API errors.

## Non-goals

- Schedule generation, recurring events, calendar sync, natural-language input,
  or task completion.

## Data-model impact

None; consumes TKT-009 persistence/API contracts.

## Risk level

Medium.

## Suggested checks

- Component tests for each form state.
- Browser flow creating a task and a fixed event on a planning day.
