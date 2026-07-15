# Architecture overview

## Status

This is a proposed technical direction distilled from prior exploration, not a
request to scaffold the full system now. Confirm the first implementation
increment in a ticket before introducing application folders, dependencies, or
deployment configuration.

## Core reliability boundary

Replanning after an interruption is the product's critical path. It should be
synchronous, deterministic, and available without an AI model or background
worker:

```txt
user reports an interruption
  -> application validates and saves it
  -> scheduler calculates a revised day
  -> application saves the new result
  -> user receives the revised plan
```

AI and asynchronous jobs may enrich that experience, but they must not be
required to complete it.

## Proposed service responsibilities

| Area | Responsibility | Proposed implementation |
| --- | --- | --- |
| Web | User interface, timeline, forms, and API calls | Angular + TypeScript + Tailwind CSS |
| Application API | Validation, persistence, orchestration, stable browser DTOs | Python FastAPI |
| Scheduler | Deterministic daily planning and rescheduling | Pure Python core with a thin FastAPI boundary |
| AI boundary | Parse informal input and draft explanations | Python FastAPI with a pluggable provider |
| Background worker | Non-critical enrichment, cleanup, and future reminders | Python worker with a Redis-backed queue |
| Data store | Durable plans and schedule snapshots | PostgreSQL |
| Short-lived coordination | Queueing, locks, caching, rate limits | Redis |
| Local model runtime | Optional local language-model access | Ollama, reachable only from the AI boundary |
| Edge routing | Single browser-facing entry point | Nginx |

Docker Compose is the proposed local development topology once more than one
service is justified. It should expose the web application and API through one
browser entry point while keeping data stores, the scheduler, AI, and model
runtime internal. A separately runnable service needs an explicit owner,
contract, configuration boundary, and health endpoint before it earns a
container; a pure package does not.

## Boundary rules

- The browser calls the application API, never the scheduler, AI service, data
  store, queue, or model runtime directly.
- The application API owns validation, persistence, and orchestration; it does
  not contain the scheduler's algorithms.
- The scheduler has no direct database, queue, or model dependency.
- The scheduler core has no web-framework or infrastructure imports.
- Only the AI boundary communicates with the local model runtime.
- PostgreSQL holds durable business data. Redis is never the source of truth.
- Background work must be idempotent and cannot delay immediate replanning.

## Service and container quality bar

When a ticket introduces a runtime service, keep its domain rules, application
use cases, transport contracts, and infrastructure adapters separate. Its
container image must run only that service, receive configuration and secrets
from the environment rather than source control, and expose only the ports the
topology requires. A Compose change must declare internal versus browser-facing
networks and include configuration validation, image-build coverage, and a
health/essential-connection smoke check. These are operational requirements for
real multi-service increments, not permission to scaffold every proposed
service early.

## Code organization when implementation begins

If the proposed services are adopted, each Python service should keep domain
rules separate from application use cases, transport contracts, and
infrastructure adapters. The scheduler core should remain a small, pure package
with the strongest test coverage. Browser models should be mapped from API
contracts rather than duplicating server assumptions.

The first delivery should create only the folders and components justified by
its ticket. A service-oriented layout is a direction, not permission to build a
large empty monorepo.

Record any confirmed deviations or consequential choices in
`docs/architecture/decisions/`.
