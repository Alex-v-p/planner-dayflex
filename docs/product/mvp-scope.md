# MVP scope

## Product boundary

The first release proves one outcome: after a disruption, a person can quickly
understand and act on a realistic plan for the remainder of that day.

The planner operates on a single day at a time. It can save and summarize many
daily plans, but it does not try to solve an entire week at once.

## In scope

### Planning inputs

- Fixed events with a name, start time, and end time.
- Flexible tasks with a name, estimated duration, priority, and stable order.
- Optional task constraints: deadline, earliest start, and whether it may be
  divided into useful segments.
- An interruption expressed either as a time block or as a reported amount of
  lost time.

### Planning outcomes

- A non-overlapping day plan that respects fixed events and interruption time.
- Completion status for scheduled work.
- A new schedule for unfinished work after an interruption.
- Items that moved, were split, or could not fit, each with a machine-readable
  reason that the interface can explain.
- Designated free-time windows that are long enough to be useful.

### Views and persistence

- A detailed day timeline.
- Week and month overviews derived from saved daily snapshots, showing such
  things as planned work, fixed events, interruptions, and available time.
- Stored plans, tasks, fixed events, interruptions, and schedule snapshots.
- Responsive web layouts for the same workflows; this is not a native-app
  commitment.

### AI assistance

AI can turn informal text into proposed task or interruption details, offer a
duration or priority suggestion, and phrase scheduling reasons more naturally.
The user and deterministic scheduler retain authority over the final plan.

## Explicit exclusions

- Full external-calendar synchronization.
- Native iOS or Android clients.
- Payments, team collaboration, or social features.
- Complex recurring habits and rich notification systems.
- Mood- or energy-driven planning.
- Automatic cross-day optimization.
- Dependence on a model response to create or revise a schedule.

## MVP acceptance check

The MVP is ready to evaluate when a user can create a day with fixed events and
tasks, generate a plan, complete some work, report lost time, and understand a
revised plan with its free time and trade-offs.
