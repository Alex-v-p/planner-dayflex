# application API service

`services/api/` is the browser-facing application boundary for
`planner-dayflex`. It will own browser DTOs, input validation, authorization,
persistence, and orchestration when the relevant scoped tickets arrive. It
does not contain scheduler algorithms, planner routes, a scheduler client, AI
behavior, Docker, or Compose topology.

The current service includes the TKT-008 foundation plus TKT-009 username and
password authentication. The lasting dependency and boundary choice is recorded
in [ADR 0003](../../docs/architecture/decisions/0003-application-api-foundation.md).

## Toolchain

The service uses Python 3.13, `uv`, FastAPI, Uvicorn, SQLAlchemy 2.x, psycopg
3, Alembic, Pydantic Settings, Argon2id password hashing through
`argon2-cffi`, Ruff, and pytest. SQLAlchemy and psycopg are runtime
dependencies because the application API owns durable persistence. Alembic is
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
python -m uv run uvicorn api_service.app:create_app --factory --host 127.0.0.1 --port 8000
```

`PLANNER_API_ENVIRONMENT` defaults to `development`; accepted values are
`development`, `test`, and `production`. Outside `test`, only
`postgresql+psycopg` URLs are accepted. SQLite is deliberately accepted only
when `PLANNER_API_ENVIRONMENT=test`, so normal service startup cannot silently
use a local test database.

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

## Migrations

Alembic owns the API schema. TKT-009 adds:

- `users`: `id`, `username`, `username_normalized`, `password_hash`,
  `created_at`, `password_changed_at`, with a unique normalized username.
- `auth_sessions`: `id`, `user_id`, `token_hash`, `expires_at`, `revoked_at`,
  `created_at`, with a unique token hash and a foreign key to `users`.

Backfill: none. Rollback: downgrade drops `auth_sessions` before `users`.

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
test fixture and does not require PostgreSQL, Docker, Compose, a scheduler, or
an AI service.
