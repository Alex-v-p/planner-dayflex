# Repository structure guide

## Purpose

This is the preferred long-term shape for `planner-dayflex`. It gives agents a
clear place for code and prevents a future grab-bag of files at the repository
root, but it is deliberately not a mandate to create every folder now.

Create only the directories required by an approved ticket. An empty service,
package, or infrastructure area is worse than a small, working vertical slice.

## Preferred top-level map

```txt
planner-dayflex/
  .codex/                    # Agent roles and repository-local Codex settings
  .github/                   # Issue forms, PR template, CI and release workflows
  apps/
    web/                     # Browser application, when a web UI is introduced

  services/
    api/                     # Application API: validation, persistence, orchestration
    scheduler/               # Thin transport boundary around scheduling core
    ai/                      # Optional natural-language parsing and explanations
    worker/                  # Optional background enrichment and cleanup

  packages/
    scheduler-core/          # Pure deterministic scheduling rules and algorithms
    shared-python/           # Small cross-service config/logging/health helpers
    openapi/                 # Generated or source API-contract artifacts

  infra/
    nginx/                   # Browser-facing reverse proxy, when needed
    docker/                  # Local container helper scripts
    db/                      # Database-local-development material
    ollama/                  # Local model runtime configuration, if adopted
    compose.yml              # Multi-service local topology, when justified

  docs/
    product/                 # Product intent, MVP boundary, reference scenarios
    architecture/            # Decisions, boundaries, delivery, and structure
    design/                  # Versioned design guidance; local visual references stay ignored
    tickets/                 # Durable ticket records when GitHub Issues are insufficient
    checklists/              # Review and release checklists
```

The names above are defaults. A ticket may justify a different implementation
detail, but it should not casually introduce a new top-level category when one
of these has the right owner.

## Ownership boundaries

| Area | Owns | Must not own |
| --- | --- | --- |
| `apps/web` | UI state, views, accessibility, and calls to the application API | Scheduler algorithms, database access, or direct AI/model calls |
| `services/api` | Input validation, authorization, persistence, orchestration, and stable browser DTOs | Scheduler algorithm internals or UI rules |
| `services/scheduler` | HTTP/transport boundary for scheduler requests and responses | Database, queue, AI, or model integration |
| `packages/scheduler-core` | Pure day-planning rules, time intervals, placement, and decision reasons | Framework, network, database, queue, or browser imports |
| `services/ai` | Optional natural-language parsing and explanation drafting | Final schedule decisions or direct browser access |
| `services/worker` | Non-critical async work | Immediate interruption replanning |
| `packages/shared-python` | Small cross-service primitives such as configuration, health, logging, and errors | Product business rules or feature-specific helpers |
| `packages/openapi` | API contract source/generated artifacts | Hand-written duplicate UI models |
| `infra` | Local topology and operational configuration | Application business logic |

## Internal service layout

When a service becomes substantial enough to need internal separation, use this
direction rather than a generic `utils` folder:

```txt
service-name/
  src/
    service_name/
      domain/          # Business concepts, value objects, pure rules
      application/     # Use cases and ports
      contracts/       # HTTP, queue, or integration request/response schemas
      interfaces/      # Routes, controllers, and other entry points
      infrastructure/  # Database, HTTP clients, queues, configuration, logging
  tests/
    unit/
    integration/
    contract/
```

Dependencies should point inward: interfaces call application code, application
uses domain rules, and infrastructure implements application ports. The domain
layer must not import framework or infrastructure code.

## Service and container ownership

An independently runnable service owns one cohesive capability and its public
and internal contracts. Do not create a service solely to make the repository
look distributed; preserve a pure package or in-process boundary until a
separate process has a concrete product or operational benefit.

When a service is containerized, place its `Dockerfile` and `.dockerignore`
beside that service so its build context and runtime are owned together. Keep
shared local topology in `infra/compose.yml` and related helpers in
`infra/docker/`. Compose should expose only the web/API entry point to the
browser, use explicit internal networks for dependencies, and supply secrets
and environment-specific configuration at runtime. The ticket that adds or
changes this material must also add proportionate configuration, image-build,
and health/connection checks.

## Web layout

Once the browser application is introduced, prefer a feature-oriented layout:

```txt
apps/web/src/app/
  core/                # Application configuration, HTTP setup, shell layout
  shared/              # Reusable presentational UI and directives
  features/
    planner/           # Day timeline, recovery flow, summaries, view models
    tasks/             # Task-focused screens and interactions
    events/            # Fixed-event interactions
    schedules/         # Saved plan and schedule-result interactions
    free-times/        # Free-time presentation and filtering
  contracts/api/       # Generated API client/types when practical
```

Keep a helper inside the feature that owns it until at least two independent
areas need it. Only then consider a shared component or package.

## Incremental creation order

1. A pure scheduling ticket may create only `packages/scheduler-core/` and its
   tests.
2. An API/persistence ticket may add `services/api/` and the smallest necessary
   contracts or database setup.
3. A scheduler transport ticket may add `services/scheduler/` once a separate
   process/boundary gives a concrete benefit.
4. A UI ticket may add `apps/web/` only when it can deliver a usable workflow.
5. AI, workers, Compose, Nginx, Redis, and local model configuration wait until
   their documented boundaries provide MVP value.

This sequence is a guardrail against recreating a large empty monorepo before
the deterministic planning loop exists.

## Structural change rule

Before adding a new top-level area, moving an ownership boundary, or extracting
shared code, the ticket plan must state:

- the existing location considered and why it no longer fits;
- the proposed location and its owner;
- affected imports/contracts and migration steps;
- tests or checks proving the move is safe.

The architect reviews these changes. Record an ADR when the decision changes a
lasting service or dependency boundary. Small, ticket-local folders do not need
an ADR.
