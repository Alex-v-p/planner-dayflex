# TKT-009: Persist planning inputs and preferences

**Status:** Planned
**Depends on:** TKT-008

## Goal

Let an authenticated user create, view, update, and remove their planning-day
preferences, fixed events, and flexible tasks through a validated API.

## User story

As a signed-in user, I can build the raw ingredients for a realistic day and
know that another user cannot see or alter them.

## Scope

- Add user preferences, planning days, tasks, and fixed-event persistence.
- Add user-scoped API operations for preferences, daily fixed events, and
  flexible tasks.
- Validate fields against the scheduler contract, including duration, priority,
  due date, split settings, and time-zone-aware event intervals.
- Preserve user ownership in every query and mutation.

## Acceptance criteria

- [ ] A user can configure day bounds/time zone and create a planning day.
- [ ] A user can create, edit, list, and remove their own fixed events and
  flexible tasks.
- [ ] Invalid intervals and task settings are rejected before persistence.
- [ ] Every data operation is scoped to the authenticated user; cross-user
  reads and mutations fail safely.
- [ ] Migrations and integration tests cover core constraints and ownership.

## Non-goals

- Generating a schedule, task completion, interruptions, recurrence, or
  calendar synchronization.

## Data-model impact

Added: `user_preferences`, `planning_days`, `tasks`, and `fixed_events` tables
with user/day ownership, interval checks, and relevant indexes.

## Risk level

High — introduces user-owned persistent data.

## Suggested checks

- Migration-up/down test where supported.
- API integration tests for validation and cross-user isolation.
