# background worker service

`services/worker/` owns non-critical asynchronous work for `planner-dayflex`.
It uses Redis-backed RQ queues with JSON serialization. The browser never calls
the worker, and planning/recovery remains synchronous through the API and
scheduler when Redis or this process is unavailable.

## Toolchain

Run commands from `services/worker/`:

```powershell
python -m uv sync --locked
python -m uv run ruff format --check .
python -m uv run ruff check .
python -m uv run pytest
```

## Configuration

The worker reads `PLANNER_WORKER_*` variables:

- `PLANNER_WORKER_REDIS_URL`: required Redis URL for RQ and non-durable cache
  state.
- `PLANNER_WORKER_AI_SERVICE_BASE_URL`: optional internal AI service URL for
  schedule explanation enrichment.
- `PLANNER_WORKER_LOG_LEVEL`: standard Python log level, default `INFO`.

Run the worker process with:

```powershell
$env:PLANNER_WORKER_REDIS_URL = "redis://127.0.0.1:6379/0"
python -m uv run python -m worker_service.interfaces.worker
```

## Contracts and boundaries

The API produces explicit version-1 job envelopes. The worker validates the
contract version and job kind before doing work. Current job kinds are:

- `test_job`: test-only observable job used by worker tests.
- `schedule_explanation_enrichment`: optional AI wording for persisted schedule
  decisions. Payloads contain only decision IDs, reason codes, deterministic
  reason text, and approved structured facts. They never contain raw prompts,
  user IDs, credentials, URLs, or provider payloads.
- `cleanup_stale_observations`: removes stale non-durable worker observation
  and cache keys under worker-owned Redis prefixes.

Redis is not a source of truth. Explanation results are cache entries only; the
API falls back to deterministic wording when a cache entry is absent.

Data-model impact: None.

Service and container impact: introduces a separate non-critical worker runtime
under `services/worker/`. Docker and Compose topology are deferred to TKT-025.
