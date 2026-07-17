# TKT-035: Add one-step interruption and recovery entry

**Status:** Planned
**Depends on:** TKT-018, TKT-022, TKT-030, TKT-034

## Goal

Make reporting an interruption a first-class calendar action that is available
from the affected event, selected time range, or assistant entry point, with a
manual fallback that works without AI.

## User story

As a user whose plan just got disrupted, I can select the affected time or
event, report what happened in one focused flow, and immediately see the
revised plan.

## Context

Recovery is Dayflex's core promise. The current complaint is that reporting an
interruption is buried behind too many menus and links. The desired experience
is direct: click an event or time range, choose to report an interruption, or
tell the assistant what happened. Manual entry must remain equally available
because immediate replanning cannot depend on AI.

## Scope

- Add a "Report interruption" action to selected fixed events, task blocks,
  empty selected time ranges, and the daily recovery action area.
- Open a focused interruption editor with date and time prefilled from the
  selected block or selected range where possible.
- Include a plain manual path for start/end time or lost-duration entry.
- Integrate TKT-022 parse-interruption suggestions when the AI service is
  available, presenting suggestions as editable proposals before saving.
- Preserve the deterministic synchronous recovery path from TKT-012 and TKT-018
  when AI is disabled, slow, unavailable, or returns a low-confidence proposal.
- After save, replace the visible schedule with the revised current snapshot
  and keep completed history, moved work, deferred work, and useful free time
  visible.
- Keep mutation feedback and retry options close to the interruption editor.

## Acceptance criteria

- [ ] A user can report an interruption from a selected calendar block or time
  range without visiting a separate status page or nested menu.
- [ ] A user can manually enter or adjust interruption timing before saving.
- [ ] If AI parsing is available, informal text produces an editable suggestion
  and never saves or replans without explicit user confirmation.
- [ ] If AI is unavailable or disabled, the manual interruption flow still
  saves and synchronously replans successfully.
- [ ] Saving an interruption updates the visible calendar to the revised plan
  without a manual page reload or separate "run plan" action.
- [ ] The revised result uses calm user-facing copy and does not expose raw
  backend terms as primary labels.

## Non-goals

- Long-lived chat history, AI-selected schedule changes, notifications,
  recurring interruptions, cross-day recovery, drag-and-drop replanning, or
  changing scheduler reason codes.

## Data-model impact

None expected. This ticket consumes existing interruption, progress, AI parsing,
and schedule snapshot contracts. If implementation discovers that interruption
source metadata is missing and required, split or amend the ticket before
changing persistence.

## Service and container impact

Browser/API/AI only: extends Angular interruption entry and consumes the
existing application API and AI parsing boundary from TKT-022. It adds no new
runnable service, Docker image, or Compose topology.

## Risk level

High - the flow touches the product's recovery promise, AI fallback behavior,
accessibility, and synchronous replanning.

## Suggested checks

- Browser test for reporting an interruption from a selected fixed event and
  from an empty selected time range.
- Browser/API tests proving disabled or unavailable AI does not block manual
  recovery.
- Component tests for editable AI suggestion, low-confidence fallback,
  validation errors, retry, and focus return.
- Accessibility review for editor opening, status announcements, and revised
  plan updates.
