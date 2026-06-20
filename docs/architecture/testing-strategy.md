# Testing strategy

## Priority order

Test the deterministic scheduler most deeply, then the contracts between
services, then the core user journey. Keep tests focused and stable instead of
relying on broad, fragile end-to-end coverage.

## CI evolution

CI starts with the first executable scheduler-core tooling rather than waiting
for the MVP. TKT-002 replaces the placeholder check with the scheduler package's
format, lint, and unit-test commands. Each later ticket that introduces a
service, browser application, contract, migration, or end-to-end path must add
its relevant checks to CI in the same PR or explain why it cannot yet run there.

The required CI status check should evolve rather than multiply into a confusing
set of temporary gates: keep stable job names, run the same commands locally and
in GitHub, and add caching only after correctness is proven. Deployment and
release tagging remain separate later work.

## Scheduler tests

Fast unit tests for the pure scheduling core should prove that:

- Fixed events and interruptions prevent invalid task placement.
- Flexible task segments never overlap each other or locked time.
- Completed work remains preserved during replanning.
- Priority, deadline, and stable ordering break ties predictably.
- A task that cannot fit is returned with a useful reason.
- Splitting happens only when allowed and never below the configured minimum.
- Buffer and free-time calculations are consistent.
- Identical input and configuration always yield identical output.

## Boundary tests

- API requests validate inputs before persistence or scheduler calls.
- The application API persists schedule snapshots returned by the scheduler.
- Scheduler HTTP contracts remain independent from storage models.
- AI failures or disabled AI cannot block generating or revising a plan.
- Background jobs retry safely and avoid duplicate effects through idempotency
  keys once workers exist.

Use a test database for persistence integration tests when one exists. Do not
make normal automated tests require a running local model.

## Interface and operational tests

Once a browser interface exists, cover the user path: create inputs, generate
a plan, report an interruption, and read the revised result. Component tests
should cover rendering of free time, deferred tasks, and decision explanations.

When the proposed multi-service topology exists, add a Compose smoke check for
health endpoints and essential internal connections. Keep model calls mocked or
stubbed in regular CI; an optional local smoke check may validate the model
boundary separately.
