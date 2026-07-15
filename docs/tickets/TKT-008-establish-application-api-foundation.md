# TKT-008: Establish the application API foundation

**Status:** Planned
**Depends on:** TKT-002

## Goal

Create the minimal application API service with configuration, health checks,
database-migration wiring, and test conventions needed by later backend tickets.

## User story

As a developer, I need one application boundary that can safely own validation,
authorization, persistence, and scheduler orchestration as those capabilities
are introduced.

## Scope

- Create `services/api/` with the selected Python web/runtime tooling.
- Establish configuration, structured logging, health endpoint, database session
  boundary, migration tooling, and test client conventions.
- Keep business features absent until their own tickets; add only the smallest
  shared code required by the service.

## Acceptance criteria

- [ ] The API starts with environment-driven configuration and a health endpoint.
- [ ] A database connection can be configured without hard-coded credentials or
  URLs.
- [ ] Migration tooling is initialized and has a documented local/test command.
- [ ] Unit and integration test foundations run in a clean environment.
- [ ] No planner endpoint, user account, scheduler client, or AI behavior is
  added yet.

## Non-goals

- Authentication, persistence models, planning API endpoints, or Compose.

## Data-model impact

Added: migration infrastructure only; no product tables.

## Service and container impact

Application API service: establishes the ownership boundary for the existing
API runtime. It adds no separately deployable service, Docker image, or Compose
topology; packaging remains deferred.

## Risk level

Medium.

## Suggested checks

- Configuration tests for missing/invalid environment values.
- Health endpoint and test-database connection tests.
