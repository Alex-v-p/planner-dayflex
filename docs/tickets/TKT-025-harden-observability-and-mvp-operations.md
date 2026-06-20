# TKT-025: Harden observability and MVP operations

**Status:** Planned
**Depends on:** TKT-020, TKT-024

## Goal

Make the complete MVP diagnosable and reproducible through safe structured
logging, correlation, service smoke checks, and a documented operational path.

## User story

As the owner, I can tell whether the application is healthy, trace a failed
planning request across services, and reproduce the core flow locally.

## Scope

- Add consistent health/readiness behavior and request correlation across the
  selected services.
- Standardize safe structured logging and error reporting without private data.
- Expand smoke checks to the core create/generate/recover flow.
- Document local troubleshooting, backup/migration considerations, and
  post-deploy verification inputs for the later release ticket.

## Acceptance criteria

- [ ] A request correlation identifier can be followed through the API and
  scheduler, and through AI/worker work when enabled.
- [ ] Logs omit passwords, tokens, raw session identifiers, and unnecessary
  private task content.
- [ ] A repeatable smoke check proves the main planning and recovery path.
- [ ] Health/readiness failures return useful operational signals without
  leaking secrets.
- [ ] Operational docs identify migration and rollback considerations.

## Non-goals

- Paid monitoring services, advanced analytics, SLO programs, or production
  deployment automation.

## Data-model impact

None.

## Risk level

Medium.

## Suggested checks

- Log-redaction tests.
- Compose smoke run and forced dependency-failure checks.
