# TKT-018: Complete work and recover from interruptions in the web app

**Status:** Planned
**Depends on:** TKT-012, TKT-017

## Goal

Complete the visible Dayflex promise: users mark progress, report lost time,
and immediately understand the revised remaining-day plan.

## User story

As a user whose day changed, I can record completed work or an interruption and
receive a calm, clear recovery plan without losing history.

## Scope

- Add full/partial task-progress interactions.
- Add an interruption form with validated start/end time and an explicit submit
  action that requests synchronous replanning.
- Highlight moved, completed, deferred, and unscheduled work in the revised
  timeline and summary.
- Preserve accessible before/after context and provide a clear retry path for
  recoverable API errors.

## Acceptance criteria

- [ ] A user can mark work complete or record a valid partial amount.
- [ ] A reported interruption replaces the visible plan with the saved revised
  snapshot without a manual reload.
- [ ] The UI explains moved/deferred work using API decision data.
- [ ] Completed history is visible and not offered as unfinished work again.
- [ ] The canonical revised-day scenario works through a browser test.

## Non-goals

- AI-generated prose, notifications, drag-and-drop replanning, or cross-day
  scheduling.

## Data-model impact

None; consumes progress/interruption contracts from TKT-012.

## Service and container impact

Browser/API only: consumes existing progress and recovery API contracts. It
adds no new runnable service, Docker image, or Compose topology.

## Risk level

High — core recovery experience.

## Suggested checks

- Browser test for partial study progress plus interruption.
- Accessibility tests for status changes and modal/form focus.
