# TKT-034: Add click-to-create calendar interactions

**Status:** Planned
**Depends on:** TKT-029, TKT-033

## Goal

Let users create planner items from the calendar itself by selecting empty time
on the day or week grid, instead of hunting through menus before they can enter
an event or task.

## User story

As a user, I can click or tap an open time slot, get a focused editor already
filled with that date and time, and save an event or task without leaving the
calendar view.

## Context

The complaint is not only visual. The current flow makes inputting events and
interruptions feel unintuitive because actions live away from the timeline. A
calendar-like planner should make the empty space useful: selecting time on the
grid should be the fastest way to create something there.

This ticket builds on TKT-029 contextual editors. It makes the calendar surface
an entry point; it does not turn the browser into the scheduling authority.

## Scope

- Add pointer and keyboard interactions for selecting an empty time slot in day
  and week time grids.
- Open the contextual editor from TKT-029 with the selected date, start time,
  and a sensible default duration prefilled.
- Let the user choose whether the new item is a fixed event or flexible task
  when that distinction is needed, using clear user-facing labels.
- Support editing existing fixed events and task inputs by selecting their
  calendar block or related list row.
- Keep selection handles, hover states, focus states, and editor open/close
  behavior accessible and predictable.
- Preserve validation, authorization, mutation refresh, deletion confirmation,
  and unsaved-data behavior from the existing API and editor tickets.
- Provide mobile-friendly alternatives where precise grid selection is hard,
  such as tapping a day/time row and adjusting time fields in the editor.

## Acceptance criteria

- [ ] Clicking or tapping an empty day-grid or week-grid time slot opens a
  create editor with date and start time prefilled.
- [ ] Keyboard users can move to a time slot, open the same create editor, save
  or cancel, and return focus to the calendar.
- [ ] Selecting an existing fixed event or task input opens the appropriate
  detail or edit flow without routing through unrelated menus.
- [ ] Validation errors keep the selected date/time and user-entered details.
- [ ] The browser never calculates final schedule placement for flexible work;
  it saves user input and displays the API's updated result.
- [ ] Supported desktop and mobile widths avoid text clipping, accidental
  overlap, and unreachable create/edit controls.

## Non-goals

- Drag-to-resize, drag-and-drop rescheduling, recurring events, external
  calendar sync, changing scheduler placement rules, or creating unsaved ghost
  schedule items that look like final scheduler results.

## Data-model impact

None. This ticket uses existing task and fixed-event persistence contracts.

## Service and container impact

Browser/API only: adds Angular calendar-surface interactions over existing
create/edit/delete API operations. It adds no new runnable service, Docker
image, or Compose topology.

## Risk level

High - direct manipulation can easily break accessibility, validation feedback,
or the distinction between user input and scheduler output.

## Suggested checks

- Component tests for slot selection, editor prefill, cancel, validation, and
  focus return.
- Browser flows creating a fixed event and a flexible task from day and week
  grid slots.
- Keyboard and screen-reader review for slot focus, selected-state labels,
  editor controls, and focus restoration.
