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

The local Compose topology builds `services/worker/Dockerfile` and starts the
worker on the internal Redis queue network. The worker has no browser-facing
port and no HTTP contract; its container health check verifies Redis
reachability for the queue consumer process.

The worker receives the API-owned canonical `X-Request-ID` as `correlation_id`
in versioned job envelopes when one is available. Canonical IDs use the form
`pdreq.<32 lowercase hex chars>`. Worker logs include only that canonical ID
with allowlisted operational events, and worker-to-AI calls propagate it back as
`X-Request-ID`. Missing correlation remains absent; non-canonical values are
replaced without logging or sending the raw value. Job logs do not include
payload bodies, task titles, Redis URLs, AI URLs, credentials, or provider
payloads.

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
under `services/worker/`. TKT-025 adds its local-only Docker image and Compose
wiring. The worker remains non-critical: API planning and recovery continue to
use deterministic scheduler responses when Redis or the worker is unavailable.
TKT-026 adds correlation propagation for existing worker jobs without changing
Redis, queue, container, or service topology.
