# application API service

`services/api/` is the browser-facing application boundary for
`planner-dayflex`. It will own browser DTOs, input validation, authorization,
persistence, and orchestration when the relevant scoped tickets arrive. It
does not contain scheduler algorithms, planner routes, user accounts, product
models, a scheduler client, AI behavior, Docker, or Compose topology.

TKT-008 creates only the service foundation: a FastAPI application factory,
typed environment configuration, safe JSON logs, a synchronous SQLAlchemy
session boundary, empty Alembic wiring, and isolated test conventions. The
lasting dependency and boundary choice is recorded in
[ADR 0003](../../docs/architecture/decisions/0003-application-api-foundation.md).

## Toolchain

The service uses Python 3.13, `uv`, FastAPI, Uvicorn, SQLAlchemy 2.x, psycopg
3, Alembic, Pydantic Settings, Ruff, and pytest. SQLAlchemy and psycopg are
runtime dependencies because the application API owns durable persistence.
Alembic is available to run the service's schema migrations. These dependencies
do not create a schema or a container topology.

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

## Migrations

Alembic is initialized with its standard generic `script.py.mako` revision
template, but `alembic/versions/` has no product revision and there are no
product tables. A later data-model ticket must add models, metadata, a reviewed
revision, and migration tests before application data is stored.

To validate local migration wiring against an explicitly configured PostgreSQL
database, set the variables shown above and run:

```powershell
python -m uv run alembic upgrade head
```

To exercise the same empty migration wiring locally against a disposable test
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
