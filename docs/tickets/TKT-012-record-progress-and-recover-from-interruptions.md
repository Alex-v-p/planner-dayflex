# TKT-012: Record progress and recover from interruptions

**Status:** Planned
**Depends on:** TKT-011

## Goal

Expose the complete backend recovery loop: record task progress or lost time,
reschedule the unfinished day synchronously, and save the revised snapshot.

## User story

As a user whose plans changed, I can mark work complete or partially complete,
report an interruption, and immediately receive a believable revised day.

## Scope

- Add authenticated task-progress and interruption API operations.
- Persist immutable progress records and interruption intervals.
- Call scheduler rescheduling with the current snapshot and user-owned inputs.
- Save and return a revised schedule snapshot with moved/deferred reasons.

## Acceptance criteria

- [ ] A user can record full or partial progress for their own task.
- [ ] A user can report an interruption with validated local time and receive a
  revised plan synchronously.
- [ ] Completed progress is preserved; unfinished work is not duplicated.
- [ ] Fixed events remain locked and overlapping interruption time is not
  double-counted.
- [ ] The canonical revised-day scenario works through the API and persistence.
- [ ] AI, workers, and queues are not required for a successful response.

## Non-goals

- Natural-language input, background explanations, browser UI, or notifications.

## Data-model impact

Added: `task_progress` and `interruptions` tables with planning-day/task
ownership, duration/interval validation, and snapshot references as needed.

## Service and container impact

Application API service: owns progress and interruption persistence and uses
the scheduler contract for synchronous recovery. It adds no separately
deployable service, Docker image, or Compose topology.

## Risk level

High — core recovery behavior and historical data.

## Suggested checks

- End-to-end API integration test for the canonical revised day.
- Cross-user isolation, partial-progress, and duplicate-submission tests.
