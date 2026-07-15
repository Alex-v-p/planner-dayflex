# TKT-030: Clarify recovery, progress, and changed-plan states

**Status:** Planned
**Depends on:** TKT-018, TKT-028

## Goal

Make the interruption recovery promise visually obvious: after real life
changes the day, the user should see what stayed done, what moved, what no
longer fits, and what time remains.

## User story

As a user whose day changed, I can report lost time and quickly understand the
revised plan without feeling blamed or forced to decode raw scheduler details.

## Context

Dayflex's differentiator is not merely calendar display; it is calm recovery.
The redesigned UI should make moved, completed, interrupted, deferred, and free
time states more legible than the current stacked reason lists.

## Scope

- Add a focused recovery action area for recording progress and interruptions
  that fits the redesigned daily workspace.
- Show completed history, reported interruptions, moved work, split work,
  deferred work, and remaining free time directly on or beside the schedule.
- Attach deterministic reasons to the relevant schedule blocks or summary
  rows, using calm prose derived from API decision data.
- Add a before/after or revised-plan indicator so the user can tell when the
  visible schedule is a recovery result.
- Keep partial progress visible and prevent completed work from appearing as
  unfinished work.
- Preserve retry paths for recoverable API or scheduler failures.

## Acceptance criteria

- [ ] Reporting an interruption updates the visible schedule and clearly marks
  the result as revised.
- [ ] Completed work, partial progress, moved work, deferred work, interruption
  time, and designated free time are visible without relying on color alone.
- [ ] The canonical revised-day scenario makes the preserved study progress,
  moved remaining study work, moved groceries, and remaining free time clear.
- [ ] Reason text maps to scheduler decision data and stays calm and
  non-judgmental.
- [ ] Recoverable failures keep entered progress or interruption details and
  offer a clear retry path.
- [ ] Accessibility announcements describe meaningful recovery state changes.

## Non-goals

- AI-generated recovery decisions, notifications, drag-and-drop replanning,
  cross-day optimization, or changing scheduler reason codes.

## Data-model impact

None.

## Service and container impact

Browser/API only: presents existing progress, interruption, snapshot, and
decision data. It adds no new runnable service, Docker image, or Compose
topology.

## Risk level

High - this is the core product promise and can easily become confusing.

## Suggested checks

- Browser test for the canonical partial-progress plus interruption scenario.
- Component tests for moved/deferred/completed/free-time state rendering.
- Accessibility scan and live-region review for revised-plan updates.
