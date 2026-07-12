# planner-dayflex

`planner-dayflex` is a forgiving daily planner for people whose days contain
both immovable commitments and work that has to flex around real life. Its
central job is to help someone recover a useful plan after an interruption,
not to punish them for having one.

The deterministic [`scheduler-core`](packages/scheduler-core/README.md), its
thin [`scheduler service`](services/scheduler/README.md) transport boundary,
the [`application API`](services/api/README.md), the
[`web application`](apps/web/README.md), the optional
[`AI service`](services/ai/README.md) parsing boundary, and the non-critical
[`worker service`](services/worker/README.md) are initialized. The API
owns browser-facing validation, authorization, persistence, and orchestration;
the browser calls that API boundary rather than scheduler, database, queue, AI,
worker, or model internals. Local Compose topology is available under
[`infra/`](infra/compose.yml); deployment remains ticketed work.

## Product direction

- Fixed events reserve time that must not move.
- Flexible tasks are placed into the remaining day according to explicit
  priorities, deadlines, and time constraints.
- An interruption triggers a new plan for the unfinished portion of the day.
- The scheduling result includes usable free time and reasons for work that
  moved or did not fit.
- AI may structure messy input or explain outcomes; deterministic scheduling
  remains responsible for the plan.

Read [the product vision](docs/product/vision.md),
[MVP scope](docs/product/mvp-scope.md), and
[architecture overview](docs/architecture/overview.md) before proposing a
feature or implementation.

The first scheduler work is grounded by the
[scheduler decisions](docs/architecture/scheduler-decisions.md) and
[canonical-day scenario](docs/product/canonical-day.md). The proposed
multi-user persistence boundary is described in the
[data model](docs/architecture/data-model.md), with the current authentication
choice in [the authentication design](docs/architecture/authentication.md).
Visual-reference metadata belongs in
[`docs/design/inspiration/`](docs/design/inspiration/); the image files are
kept locally and ignored by Git.

This repository is prepared for AI-assisted, ticket-driven development. Start by
describing the product in [docs/product/vision.md](docs/product/vision.md), then
create a ticket before making implementation changes.

## Repository workflow

1. Create a GitHub Issue using the Ticket form, or add a ticket under
   `docs/tickets/`.
2. Create a `tkt-ISSUE_NUMBER-short-title` branch from `develop`, then ask
   Codex to use the `orchestrator` agent for that ticket.
3. Agents commit and push each verified, coherent milestone to that working
   branch; they never push directly to `develop` or `main`.
4. Review the draft pull request into `develop`, its checks, and the agent
   review. A human merges it when ready.
5. When an integration release is ready, open a release PR from `develop` to
   `main`; a human performs the final merge and deployment follows `main`.

The complete branching, remediation, and commit policy is in
[the delivery workflow](docs/architecture/delivery-workflow.md).

The intended application layout is described in the flexible
[repository structure guide](docs/architecture/repository-structure.md).

Release numbering and the planned automation work are documented in
[the versioning policy](docs/architecture/versioning.md) and the queued
[release automation ticket](docs/tickets/TKT-027-release-versioning-and-cd.md).

The scheduler-core, scheduler-service, API-service, AI-service, worker-service,
and web-application CI jobs run their documented format, lint, test,
image-build, Compose-topology, and build commands as applicable. Deployment
remains a safe placeholder until a hosting platform is chosen.

## Local Compose topology

From a clean checkout with Docker available, start the local stack through the
reverse proxy:

```powershell
.\infra\docker\smoke-local.ps1 -KeepRunning
```

Open `http://127.0.0.1:8080`. The helper validates startup, checks
`/edge-health`, `/api/health`, and `/api/ready` through the proxy, registers a
unique smoke user, creates the canonical day, generates a plan, records
progress, reports the interruption, and asserts the revised schedule, decisions,
version, and free-time window. It also verifies database and Redis connections
through service-owned code, and leaves the stack running when `-KeepRunning` is
supplied. Stop and remove local volumes with:

```powershell
.\infra\docker\cleanup-local.ps1
```

The default topology runs the reverse proxy, web app, API, scheduler,
PostgreSQL, Redis, AI service in disabled-provider mode, and the non-critical
worker. Browser traffic is published only by the edge proxy on localhost. The
proxy routes `/` to the web app and `/api/` to the API; scheduler, AI, worker,
PostgreSQL, Redis, and model runtime routes are not exposed to the browser.
For a reduced stack, start only `edge web api scheduler postgres redis`; API
health and deterministic scheduling remain usable, and optional AI/worker
features use their existing fallback behavior when those services are absent.

Local defaults live in [`infra/docker/.env.example`](infra/docker/.env.example).
They are non-secret development placeholders. Real credentials and overrides
must come from the environment or an untracked env file. The optional Ollama
runtime is profile-gated and attached only to the AI/model network:

```powershell
docker compose --env-file .\infra\docker\.env.example -f .\infra\compose.yml --profile model up -d ollama ai
```

Health checks follow service semantics: API, scheduler, and AI health endpoints
are dependency-free liveness; PostgreSQL and Redis use connection checks; the
worker health check verifies Redis reachability because it has no HTTP surface.
API readiness is exposed as `GET /api/ready` through the edge and checks only
safe dependency names: `database` and `scheduler`. Scheduler and AI also expose
internal `GET /ready` endpoints, but the edge must not route browser traffic to
those internal services.

Safe log correlation uses the `X-Request-ID` header. API, scheduler, AI, and
worker logs emit single-line JSON with an allowlisted event name and the
sanitized request ID when one is present. If a caller sends a missing or unsafe
ID, the service generates an opaque replacement and returns it in the response
header. Do not put passwords, tokens, session cookies, provider credentials, or
private task text in request IDs.

For local troubleshooting, start with:

```powershell
docker compose --env-file .\infra\docker\.env.example -f .\infra\compose.yml ps
docker compose --env-file .\infra\docker\.env.example -f .\infra\compose.yml logs api scheduler ai worker
Invoke-RestMethod http://127.0.0.1:8080/api/ready
```

If readiness reports `database` unavailable, verify the PostgreSQL container is
healthy and rerun API migrations with the Compose API container. If readiness
reports `scheduler` unavailable, inspect scheduler logs and confirm the edge is
not exposing scheduler routes directly. For a clean local retry, run
`.\infra\docker\cleanup-local.ps1`; it removes disposable local volumes.

Migration and rollback considerations for release planning: the current
operational hardening ticket has data-model impact `None`, so it introduces no
migration, backfill, or schema rollback. Existing API migrations still need a
database backup before a production release, `alembic upgrade head` during
deployment, and a rollback plan that restores the previous application version
plus the pre-deploy database backup if a migration-bearing release later fails.
Post-deploy verification inputs for the later release ticket should include
`/api/health`, `/api/ready`, a unique `X-Request-ID`, registration/login,
canonical day plan generation, progress recording, interruption recovery, and a
log lookup by that request ID across API, scheduler, optional AI, and optional
worker logs.

Data-model impact: None. TKT-025 adds no migrations, tables, fields,
constraints, indexes, or backfills.

Service and container impact: local-only Dockerfiles for existing services and
a shared Compose/Nginx topology. TKT-026 adds readiness/correlation behavior and
expands operational verification, but adds no new service, store, queue, reverse
proxy, exposed port, production deployment, TLS, or browser access to internal
services.
