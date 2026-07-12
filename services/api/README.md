# application API service

`services/api/` is the browser-facing application boundary for
`planner-dayflex`. It owns browser DTOs, input validation, authorization,
persistence, and orchestration. It does not contain scheduler algorithms,
provider-specific AI behavior, Docker, or Compose topology.

The current service includes the TKT-008 foundation, TKT-009 username/password
authentication, TKT-010 persisted planning inputs, TKT-011 daily plan
generation through the scheduler service, and TKT-012 progress/interruption
recovery. TKT-022 adds authenticated planning AI parse proxy endpoints backed by
the optional AI service, and TKT-023 adds optional AI wording for existing
schedule decisions. The lasting dependency and boundary choices are
recorded in
[ADR 0003](../../docs/architecture/decisions/0003-application-api-foundation.md)
and [ADR 0004](../../docs/architecture/decisions/0004-ai-service-boundary.md).
TKT-024 adds an optional Redis/RQ producer for non-critical worker enrichment.

## Toolchain

The service uses Python 3.13, `uv`, FastAPI, Uvicorn, SQLAlchemy 2.x, psycopg
3, Alembic, Pydantic Settings, Argon2id password hashing through
`argon2-cffi`, HTTPX, Redis, RQ, Ruff, and pytest. SQLAlchemy and psycopg are runtime
dependencies because the application API owns durable persistence. HTTPX is a
runtime dependency because TKT-011 calls the scheduler service through its HTTP
contract. Redis and RQ are runtime dependencies because TKT-024 can enqueue
non-critical worker jobs when an explicit Redis URL is configured. Alembic is
available to run the service's schema migrations. These dependencies do not
create a container topology.

Run all commands from `services/api/`:

```powershell
python -m uv sync --locked
python -m uv run ruff format --check .
python -m uv run ruff check .
python -m uv run pytest
```

## Configuration and local start

The application factory reads only `PLANNER_API_*` variables. It never supplies
a database URL, username, password, host, or database name. A normal local or
production process requires an explicit PostgreSQL psycopg URL:

```powershell
$env:PLANNER_API_ENVIRONMENT = "development"
$env:PLANNER_API_DATABASE_URL = "postgresql+psycopg://<user>:<password>@<host>:5432/<database>"
$env:PLANNER_API_LOG_LEVEL = "INFO"
$env:PLANNER_API_SCHEDULER_BASE_URL = "http://127.0.0.1:8001"
$env:PLANNER_API_SCHEDULER_VERSION = "0.1.0"
$env:PLANNER_API_AI_SERVICE_BASE_URL = "http://127.0.0.1:8002"
$env:PLANNER_API_AI_CLIENT_TIMEOUT_SECONDS = "2.0"
$env:PLANNER_API_WORKER_REDIS_URL = "redis://127.0.0.1:6379/0"
python -m uv run uvicorn api_service.app:create_app --factory --host 127.0.0.1 --port 8000
```

`PLANNER_API_ENVIRONMENT` defaults to `development`; accepted values are
`development`, `test`, and `production`. Outside `test`, only
`postgresql+psycopg` URLs are accepted. SQLite is deliberately accepted only
when `PLANNER_API_ENVIRONMENT=test`, so normal service startup cannot silently
use a local test database.

`PLANNER_API_SCHEDULER_BASE_URL` defaults to `http://127.0.0.1:8001` and is
used only by the explicit scheduler HTTP client. `PLANNER_API_SCHEDULER_VERSION`
defaults to `0.1.0` and is persisted with each generated schedule snapshot for
history and auditability.

`PLANNER_API_AI_SERVICE_BASE_URL` is optional. When unset, planning AI parse and
schedule-explanation routes return an explicit `ai_disabled` fallback and normal
planning remains available. `PLANNER_API_AI_CLIENT_TIMEOUT_SECONDS` defaults to
`2.0` and is bounded so optional AI wording cannot block planning or recovery.

`PLANNER_API_WORKER_REDIS_URL` is optional. When unset, schedule generation,
interruption recovery, and on-demand explanation routes use a disabled queue
client. When set, the API enqueues versioned Redis/RQ jobs after a schedule
snapshot has been committed. Queue failures are logged as safe operational
events and do not roll back or block planning responses.

`GET /health` returns `200` with `{"status":"ok"}` for process liveness. It
does not run a database query: a database outage should not make a process
liveness signal ambiguous. The explicit readiness convention is
`app.state.database.check_connection()`, which executes `SELECT 1`; the
isolated database integration test exercises it. A future operations ticket
may expose that convention as a readiness endpoint once its contract and
deployment use are scoped.

Logs are single-line JSON with only timestamp, severity, logger name, and a
allowlisted service-controlled event name. The same formatter replaces the
effective API, Uvicorn error, and Uvicorn access handlers, so access entries
never render a request target or query string. Settings, URL values, request
bodies, arbitrary event values, and arbitrary log-message text are not emitted
by the formatter.

## Authentication

The authentication surface is intentionally small:

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`

Usernames are normalized by trimming and lowercasing, then must be 3-32
lowercase ASCII letters, digits, `_`, or `-`. Passwords must be 12-128
characters. Registration creates the account and immediately signs the browser
in.

Sessions use the `planner_session` cookie with `HttpOnly` and `SameSite=Lax`.
The cookie is marked `Secure` only when `PLANNER_API_ENVIRONMENT=production`.
The browser receives an opaque random token; the database stores only its
SHA-256 hash in `auth_sessions.token_hash`. Session TTL is 7 days. Logout
revokes the current session server-side and clears the cookie. The application
also exposes a reusable authenticated-user dependency and a password-change
session revocation helper for future protected flows.

Unknown usernames and wrong passwords return the same login error. Passwords,
session tokens, session-token hashes, and password hashes are not returned in
API JSON and should never be logged.

Failed registration and login attempts use an in-process MVP rate limiter keyed
by client, route, and normalized username where applicable. This protects a
single API process only; it is not shared across workers, hosts, restarts, or a
future distributed topology. Do not treat it as a replacement for a shared
limiter if the service is later scaled horizontally.

## Planning inputs

The planning input surface requires an authenticated session and scopes every
query through the current user's ID:

- `GET /planning/preferences`
- `PUT /planning/preferences`
- `DELETE /planning/preferences`
- `POST /planning/days`
- `GET /planning/days`
- `GET /planning/days/{planning_day_id}`
- `POST /planning/days/{planning_day_id}/generate-plan`
- `GET /planning/days/{planning_day_id}/schedule`
- `GET /planning/days/{planning_day_id}/schedule-snapshots`
- `GET /planning/schedule-snapshots/{snapshot_id}`
- `POST /planning/days/{planning_day_id}/fixed-events`
- `GET /planning/days/{planning_day_id}/fixed-events`
- `PUT /planning/days/{planning_day_id}/fixed-events/{fixed_event_id}`
- `DELETE /planning/days/{planning_day_id}/fixed-events/{fixed_event_id}`
- `POST /planning/days/{planning_day_id}/task-progress`
- `POST /planning/days/{planning_day_id}/interruptions`
- `POST /planning/ai/parse-task`
- `POST /planning/ai/parse-interruption`
- `POST /planning/days/{planning_day_id}/schedule-decisions/{decision_id}/ai-explanation`
- `POST /planning/tasks`
- `GET /planning/tasks`
- `PUT /planning/tasks/{task_id}`
- `DELETE /planning/tasks/{task_id}`

Planning day and fixed-event ownership is resolved through `planning_days.user_id`;
the API never trusts a browser-supplied user ID. Cross-user reads and mutations
return `404` where a specific resource is involved.

Validation rejects invalid IANA time zones, day bounds where the start is not
before the end, negative buffer values, non-positive task estimates, task
priorities outside `1..5`, invalid split settings, naive datetimes, and fixed
event intervals where `end_at` is not after `start_at`. Fixed events are
half-open intervals: adjacent events are accepted, overlapping events on the
same planning day are rejected before persistence.

Task removal is soft: `DELETE /planning/tasks/{task_id}` marks an active task
as `removed`, and list/update/delete operations only operate on active tasks.
This preserves future schedule-history compatibility. Fixed events are hard
deleted because TKT-010 does not create schedule snapshots or other historical
references.

Task progress records are immutable. `POST
/planning/days/{planning_day_id}/task-progress` validates that the planning day
and task are owned by the authenticated user, that `recorded_at` is
offset-aware, and that cumulative progress for the task on that day does not
exceed the task estimate.

## Schedule generation

`POST /planning/days/{planning_day_id}/generate-plan` maps the authenticated
user's planning day, fixed events, active tasks, and preferences into the
scheduler service `POST /v1/schedule-day` contract. The API service does not
import or run scheduler-core algorithms.

A successful generation persists a new immutable `schedule_snapshots` row, its
chronological `schedule_items`, and structured `schedule_decisions`, then moves
`planning_days.current_snapshot_id` to the new snapshot. Prior snapshots remain
available through the history endpoints. Scheduler validation failures return a
safe `422`; scheduler availability or malformed-response failures return a safe
`503`. Both failure paths roll back without partial snapshot rows or a current
pointer update.

`POST /planning/days/{planning_day_id}/interruptions` records an authenticated
unavailable interval and synchronously calls the scheduler service
`POST /v1/reschedule-day` with the current snapshot, persisted progress, fixed
events, and interruption history. The interruption start becomes scheduler
`current_at` so completed history before the interruption can be preserved while
unfinished work is reconsidered. If there is no current snapshot, the endpoint
returns the same safe planning-resource `404` used by schedule reads. Scheduler
validation failures return `422`; scheduler availability or malformed-response
failures return `503` and roll back the interruption plus revised snapshot.

Service and container impact for TKT-012: the application API service owns
validation, authorization, persistence, and scheduler orchestration for recovery.
TKT-022 service and container impact: the API gains an internal AI-service
client and authenticated parse proxy routes. TKT-023 extends that client with
optional schedule-explanation wording for existing decisions. No persistence,
migration, direct provider access, API Docker image, worker, queue, or Compose
topology is added. TKT-024 adds an optional worker queue producer only; Docker
and Compose topology stay deferred to TKT-025. TKT-025 adds a local-only API
Docker image and Compose wiring to PostgreSQL, scheduler, optional AI, and
optional Redis/RQ worker producer configuration. Browser access still reaches
the API only through the reverse proxy `/api/` route.

For the local Compose topology, the API container runs `alembic upgrade head`
before Uvicorn so a clean local PostgreSQL volume is usable. This does not add
or change migrations.

## Planning AI helpers

`POST /planning/ai/parse-task` and `POST /planning/ai/parse-interruption`
accept informal text plus optional local date and time zone. They call only the
internal `services/ai` HTTP contract when `PLANNER_API_AI_SERVICE_BASE_URL` is
configured. They never persist raw text or proposals, never schedule work, and
never call a provider directly.

`POST
/planning/days/{planning_day_id}/schedule-decisions/{decision_id}/ai-explanation`
requires an authenticated user-owned day and decision. It returns a cached
worker result when one is available. If no result is cached, it best-effort
enqueues a versioned worker job containing only the decision ID, reason code,
deterministic reason text, and approved structured schedule facts, then returns
deterministic fallback wording. The endpoint does not change the schedule,
persist explanation history, call a provider directly, or replace deterministic
scheduler wording.

All disabled, unreachable, timeout, non-success, malformed JSON, and
schema-invalid AI-service paths return a safe fallback result. Parse fallbacks
use the shared parse shape:

```json
{
  "status": "fallback",
  "confidence": 0.0,
  "proposed_fields": {},
  "fallback_reason": "service_unavailable",
  "error_code": "ai_service_unavailable"
}
```

Schedule-explanation fallbacks keep the deterministic reason in the API
response and return `explanation: null` with stable fallback metadata.

After schedule generation or interruption recovery commits a snapshot, the API
also enqueues one schedule-explanation job per supported decision. Worker job
payloads do not include raw prompts, provider payloads, user IDs, credentials,
or URLs.

## Migrations

Alembic owns the API schema. TKT-009 adds:

- `users`: `id`, `username`, `username_normalized`, `password_hash`,
  `created_at`, `password_changed_at`, with a unique normalized username.
- `auth_sessions`: `id`, `user_id`, `token_hash`, `expires_at`, `revoked_at`,
  `created_at`, with a unique token hash and a foreign key to `users`.

TKT-010 adds:

- `user_preferences`: `user_id`, `time_zone`, local day bounds, and
  `default_buffer_minutes`.
- `planning_days`: `id`, `user_id`, `local_date`, `time_zone`, and
  `created_at`, with unique `(user_id, local_date)`.
- `tasks`: user-owned flexible task inputs with duration, priority, due date,
  earliest start, split settings, status, and timestamps.
- `fixed_events`: planning-day-owned locked intervals with title, timezone,
  interval, and timestamps.

TKT-011 adds:

- `planning_days.current_snapshot_id`: nullable latest-snapshot pointer.
- `schedule_snapshots`: immutable per-day results with version, creation time,
  scheduler version, and scheduler configuration JSON.
- `schedule_items`: persisted timeline blocks with kind, source IDs where
  applicable, and timezone-aware interval columns.
- `schedule_decisions`: persisted scheduler decisions and warnings with reason
  codes and details JSON.

TKT-012 adds:

- `task_progress`: immutable task completion records with task/day foreign
  keys, positive completed minutes, `recorded_at`, and `created_at`.
- `interruptions`: planning-day-owned unavailable intervals with timezone,
  reported time, created time, and interval validation.
- A foreign key from `schedule_items.interruption_id` to `interruptions.id` so
  revised snapshots can link scheduler interruption blocks to the saved report.

Backfill: none. Rollback: downgrade drops TKT-012 interruption/progress records
before schedule history and planning input tables, then drops `auth_sessions`
and `users`.

TKT-024 data-model impact: None. It adds no tables, fields, constraints,
indexes, migrations, durable job storage, or audit tables.

To validate local migration wiring against an explicitly configured PostgreSQL
database, set the variables shown above and run:

```powershell
python -m uv run alembic upgrade head
```

To exercise the same migration wiring locally against a disposable test
database (SQLite is test-only):

```powershell
$env:PLANNER_API_ENVIRONMENT = "test"
$env:PLANNER_API_DATABASE_URL = "sqlite+pysqlite:///./api-test.db"
python -m uv run alembic upgrade head
Remove-Item .\api-test.db -ErrorAction SilentlyContinue
```

The full `pytest` suite creates a different temporary SQLite database for each
test fixture and uses a fake scheduler client where schedule generation is
exercised. It does not require PostgreSQL, Docker, Compose, a live scheduler,
or an AI service.
