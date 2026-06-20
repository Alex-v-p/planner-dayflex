# Product vision

## App idea

`planner-dayflex` is a flexible daily planner for days that do not unfold as
expected. It combines non-movable commitments, work that can move, and sudden
lost time into a practical plan for the rest of the day.

The product promise is simple: when the day changes, the plan should help the
user recover instead of making them rebuild everything by hand.

## Target users

People who juggle appointments, work or study, errands, and personal tasks,
and need a lightweight way to make realistic choices when time disappears.

## Problem

Traditional planners often assume that every planned block will happen as
written. After a delay or interruption, users are left with an outdated plan
and an uncomfortable pile of work. They need to know what can still fit, what
should move, and why.

## Core experience

1. The user records fixed events that reserve time.
2. The user adds flexible tasks with enough information to make trade-offs.
3. The app builds a conflict-free day plan and identifies meaningful free time.
4. If time is lost, the user reports the interruption.
5. The app recalculates unfinished work and clearly explains moved or
   unscheduled items.

The tone should be calm, practical, and free from guilt. A deferred task is a
normal planning outcome, not a failure.

## MVP

The first version should include:

- Fixed events with a title and start/end time.
- Flexible tasks with an estimate, priority, optional deadline, and optional
  splitting permission.
- A daily schedule that avoids locked time and task overlaps.
- Completion tracking for scheduled work.
- Interruption reporting and a revised remaining-day plan.
- Explanations for work that moved, did not fit, or was split.
- Designated free-time windows as a first-class result.
- Day detail plus week and month summary views based on stored daily plans.
- Durable storage for plans, inputs, interruptions, and generated results.
- Optional AI help for interpreting input and explaining decisions.

## Non-goals

The first version should not include:

- Calendar synchronization.
- Native mobile applications.
- Payments, social collaboration, or a broad habit system.
- Advanced notifications or extensive personalization.
- Cross-day schedule optimization.
- An AI system that chooses the final schedule.

## Success criteria

The app is successful when:

- A user can record a realistic day and receive a plan without overlaps.
- A reported interruption produces a revised plan for the remaining day.
- The user can see which work fits, which work moved, and why.
- The plan remains useful if AI assistance is unavailable.
