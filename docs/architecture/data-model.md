# Suggested MVP data model

## Ownership and identity boundary

Design records as user-owned from the first persistence ticket, even if the
first local environment has only one seeded user. The MVP authenticates with a
username and password; use an opaque `users.id` internally and do not make
ownership nullable.

The model supports multiple independent users. Every application query must be
scoped by the authenticated user's ID once authentication exists. A user must
never be able to retrieve or mutate another user's plans, tasks, events, or
schedule history.

## Core tables

| Table | Purpose | Important fields |
| --- | --- | --- |
| `users` | Product account and password credential metadata | `id`, `username`, `username_normalized`, `password_hash`, `created_at`, `password_changed_at` |
| `auth_sessions` | Revocable signed-in sessions; never store a raw session token | `id`, `user_id`, `token_hash`, `expires_at`, `revoked_at`, `created_at` |
| `user_preferences` | Per-user planning defaults | `user_id`, `time_zone`, `day_start_local`, `day_end_local`, `default_buffer_minutes` |
| `planning_days` | One user's planning context for one local date | `id`, `user_id`, `local_date`, `time_zone`, `current_snapshot_id`, `created_at` |
| `tasks` | User-owned flexible work, which may outlive one planning day | `id`, `user_id`, `title`, `estimated_minutes`, `priority`, `due_date`, `earliest_start_at`, `splitting_allowed`, `status`, `created_at` |
| `fixed_events` | Locked commitments on a planning day | `id`, `planning_day_id`, `title`, `start_at`, `end_at`, `time_zone` |
| `interruptions` | Reported unavailable time on a planning day | `id`, `planning_day_id`, `start_at`, `end_at`, `reported_at` |
| `task_progress` | Immutable completion records, including partial work | `id`, `task_id`, `planning_day_id`, `completed_minutes`, `recorded_at` |
| `schedule_snapshots` | Immutable scheduler outputs for auditing and recovery | `id`, `planning_day_id`, `version`, `created_at`, `scheduler_version`, `configuration_json` |
| `schedule_items` | Segments inside a snapshot | `id`, `snapshot_id`, `kind`, `task_id`, `fixed_event_id`, `interruption_id`, `start_at`, `end_at` |
| `schedule_decisions` | Structured reasons for placements, deferrals, and warnings | `id`, `snapshot_id`, `task_id`, `reason_code`, `details_json` |

`kind` on `schedule_items` distinguishes a task segment, fixed event,
interruption, buffer, or designated free-time window. Source foreign keys are
nullable only when they do not apply to that kind.

## Relationships and constraints

```txt
users
  -> user_preferences, auth_sessions (1:many; preferences is effectively 1:1)
  -> planning_days (1:many)
  -> tasks (1:many)

planning_days
  -> fixed_events, interruptions, task_progress (1:many)
  -> schedule_snapshots (1:many)

schedule_snapshots
  -> schedule_items, schedule_decisions (1:many)
```

- `planning_days` is unique on `(user_id, local_date)`.
- `username_normalized` is unique. The MVP accepts 3–32 lowercase ASCII
  characters from letters, digits, `_`, and `-`; normalization trims input and
  lowercases it before lookup.
- `schedule_snapshots` is unique on `(planning_day_id, version)`.
- Time intervals use timezone-aware timestamps and must have `end_at > start_at`.
- Fixed-event overlap validation belongs in application/scheduler validation;
  keep a database constraint for valid individual intervals as a backstop.
- `completed_minutes` is positive and may not exceed the task's remaining work
  when recorded.
- A snapshot is historical. Updating `planning_days.current_snapshot_id` selects
  the latest result without overwriting what the user previously saw.

## Data-model change protocol

Any ticket that changes persistence must say **Data-model impact** and make the
change reviewable before implementation. The ticket and PR must list:

| Change type | Required detail |
| --- | --- |
| Added | Tables, fields, constraints, indexes, and why they are needed. |
| Changed | Old and new meaning or type, affected queries/API contracts, and data migration or backfill plan. |
| Removed | Data being removed, retention/deletion effect, rollout order, and rollback or recovery plan. |

If no persistence changes are needed, write `Data-model impact: None`.

Schema changes require a migration, migration tests where applicable, and an
explicit ownership/authorization check for every new user-owned record. Do not
hide a schema change inside an unrelated feature patch.

## Deliberate MVP boundaries

- Tasks belong to a user rather than a particular day, so a deferred task can
  appear in a later planning day without duplicating it.
- The MVP schedules one day at a time; this schema does not imply cross-day
  optimization.
- Keep model responses and credentials out of these tables unless a later,
  privacy-scoped ticket explicitly introduces AI interaction history.
- Define account deletion and retention behavior before the first production
  persistence release.
