# ADR 0005: Non-critical worker boundary

## Status

Accepted for TKT-024.

## Context

Planning and interruption recovery are the product's critical path. They must
remain synchronous, deterministic, and useful without AI, Redis, or a worker.
TKT-024 introduces background work only for optional enrichment and cleanup.

## Decision

Create `services/worker/` as a separate Python runtime using RQ with Redis and
JSON job serialization. The API owns producing explicit version-1 job envelopes.
The worker independently validates supported versions and job kinds.

The initial worker jobs are:

- `schedule_explanation_enrichment`: optional wording for persisted scheduler
  decisions using only reason codes, deterministic reason text, decision IDs,
  and approved structured facts.
- `cleanup_stale_observations`: cleanup of worker-owned non-durable Redis
  observation/cache keys.
- `test_job`: a test-only contract proving enqueue, consumption, idempotency,
  and failure behavior.

The API enqueues explanation jobs only after schedule snapshots are committed.
Queue unavailability is logged through safe allowlisted events and never rolls
back planning or interruption recovery. On-demand explanation requests can use
a cached worker result or return deterministic fallback wording while
best-effort enqueueing enrichment.

## Consequences

Data-model impact: None. Redis cache and RQ state are not durable product data.

Service and container impact: a worker runtime exists under `services/worker/`.
Docker and Compose topology are deferred to TKT-025, so this ticket adds no
image definition, exposed port, reverse proxy rule, or local topology.

The scheduler core and scheduler service retain no queue or AI dependency. The
browser continues to talk only to the API.
