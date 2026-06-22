# TKT-025: Build the local Compose topology

**Status:** Planned
**Depends on:** TKT-007, TKT-012, TKT-013, TKT-024

## Goal

Provide a reproducible local multi-service environment only after the relevant
services exist, with clear network boundaries and health checks.

## User story

As a developer, I can start the application’s selected local services through
one documented command and inspect their health without exposing internal
dependencies to the browser.

## Scope

- Add Compose configuration for the web app, API, scheduler, AI service,
  worker, PostgreSQL, Redis, reverse proxy, and optional local model runtime.
- Add environment templates, health checks, internal networking, and local
  startup/smoke helper scripts.
- Route browser traffic through the reverse proxy to web and API only.
- Ensure only the AI service can contact the model runtime.

## Acceptance criteria

- [ ] A documented local command starts the selected service set from a clean
  environment.
- [ ] Health checks cover web entry, API, scheduler, AI boundary, worker,
  database, and Redis where enabled.
- [ ] Browser-facing routing exposes only the intended web/API paths.
- [ ] Secrets remain environment-provided and absent from committed files.
- [ ] The API/scheduler remain usable with AI and worker disabled where their
  optional features are not requested.

## Non-goals

- Production hosting, external TLS, automatic deployment, or treating Compose
  as a production platform.

## Data-model impact

None.

## Service and container impact

Compose topology: packages the selected existing services and their explicit
network boundaries. Validate Compose configuration, build changed images, check
service health and connections, verify network isolation, and add practical CI
coverage or document why it cannot run there.

## Risk level

High — networking, credentials, and local service coordination.

## Suggested checks

- Compose smoke script from a clean checkout.
- Network/port inspection and health endpoint checks.
