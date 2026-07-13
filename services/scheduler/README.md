# scheduler service

The scheduler service is the deliberately narrow HTTP transport boundary for
the pure [`scheduler-core`](../../packages/scheduler-core/README.md) package.
It owns request/response validation and serialization only; the core still owns
all deterministic scheduling and rescheduling decisions.

It has no database, queue, Redis, AI/model, authentication, or browser
dependency. The application API is the browser-facing owner and may call this
contract; browsers must not call this service directly.

## Local dependency and toolchain

The service uses Python 3.13, `uv`, FastAPI, Uvicorn, Ruff, and pytest. Its
`pyproject.toml` declares `planner-dayflex-scheduler-core` as a local editable
dependency at `../../packages/scheduler-core`, which keeps the transport thin
while making the core's public contracts the only business-logic dependency.
The lasting boundary and dependency choice are recorded in
[ADR 0002](../../docs/architecture/decisions/0002-scheduler-service-transport.md).

Run these commands from this directory:

```sh
python -m uv sync --locked
python -m uv run ruff format --check .
python -m uv run ruff check .
python -m uv run pytest
python -m uv run uvicorn scheduler_service.app:app --host 127.0.0.1 --port 8001
```

`GET /health` is a process liveness endpoint. It returns `200` with
`{"status":"ok"}` and deliberately has no dependency checks because this
service has no infrastructure dependencies.
`GET /ready` returns the same safe `{"status":"ok"}` readiness shape because
the scheduler has no database, queue, model, or provider dependency.

The service accepts only canonical `X-Request-ID` values in the form
`pdreq.<32 lowercase hex chars>`. Missing or non-canonical values are replaced
with a freshly generated canonical ID, which is returned in the response header
and included in structured JSON logs. Logs contain only allowlisted operational
event names; they do not include request bodies, task titles, URLs, or
credentials.

TKT-025 adds a local-only scheduler Docker image and Compose service on an
internal network. It is not published to the host or routed by the edge proxy.

## HTTP contract

All JSON datetimes are ISO 8601 strings with an explicit UTC offset, such as
`2026-06-22T08:00:00+02:00` or `2026-06-22T06:00:00Z`. Naive datetimes are not
accepted. Intervals are half-open: `[start, end)`.

Primitive values are strict: identifiers, titles, IANA zones, and detail values
are JSON strings; minute counts, priorities, and scheduler configuration counts
are JSON integers; and `splitting_allowed` is a JSON boolean. The service does
not coerce strings or booleans into scheduler-core values.

`POST /v1/schedule-day` accepts a `ScheduleRequest` object:

| Field | Shape |
| --- | --- |
| `planning_day` | `{ "local_date": "YYYY-MM-DD", "time_zone": "IANA zone" }` |
| `current_at` | Offset-bearing ISO datetime |
| `fixed_events` | Array of `{ id, title, interval: { start, end } }` |
| `interruptions` | Array of `{ id, interval: { start, end } }` |
| `tasks` | Array of `{ id, title, estimated_minutes, priority, created_at, due_date?, earliest_start_at?, splitting_allowed? }` |
| `task_progress` | Optional array of `{ task_id, completed_minutes, recorded_at }` |
| `configuration` | Optional `{ day_start, day_end, buffer_minutes, minimum_free_time_minutes, minimum_segment_minutes, maximum_task_segments }` |

`POST /v1/reschedule-day` accepts:

```json
{
  "previous_result": { "items": [], "decisions": [], "warnings": [] },
  "schedule_request": { "planning_day": {}, "current_at": "...", "fixed_events": [], "interruptions": [], "tasks": [] }
}
```

Both POST endpoints return a `ScheduleResult` object:

| Field | Shape |
| --- | --- |
| `items` | Chronological `{ kind, interval: { start, end }, task_id }` blocks |
| `decisions` | `{ reason_code, task_id, details }` facts |
| `warnings` | `{ code, details }` valid-input warnings |

`reason_code` and warning `code` values are preserved exactly from
`scheduler-core` (for example, `moved_after_interruption` and
`locked_time_overlap_merged`); callers can safely map them to gentle prose.

Schema validation failures and `scheduler-core` validation failures both return
`422` with the safe, payload-free envelope:

```json
{
  "code": "validation_error",
  "details": ["The scheduler request is invalid."]
}
```
