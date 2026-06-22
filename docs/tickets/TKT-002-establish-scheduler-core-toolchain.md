# TKT-002: Establish the scheduler-core toolchain

**Status:** Planned
**Depends on:** TKT-001

## Goal

Create the smallest runnable foundation for the pure deterministic scheduler
package, confirming the initial Python toolchain and making its repeatable
checks the repository's first real CI gate.

## User story

As a developer, I need one focused package whose local quality commands also
run on pull requests, so later development begins with feedback rather than
adding it as a final hardening task.

## Scope

- Confirm Python as the scheduler-core runtime and record the selected version,
  package manager, formatter, linter, and test runner in an ADR or ticket note.
- Create `packages/scheduler-core/` with installable package metadata, source
  root, tests, and one documented command for each check.
- Replace the placeholder CI job with checks that run those same scheduler-core
  commands on pull requests and pushes to `develop`/`main`.
- Add a minimal import/smoke test without introducing FastAPI, a database,
  Docker, AI, or web code.

## Acceptance criteria

- [ ] The toolchain decision and commands are documented.
- [ ] The package installs in an isolated environment.
- [ ] Formatting, linting, and tests run locally through documented commands.
- [ ] The GitHub CI workflow runs the same formatting, linting, and test
  commands for scheduler-core changes.
- [ ] The CI job has a stable, descriptive name that can be required by the
  `develop` and `main` branch rules after its first successful run.
- [ ] The first test imports the package and demonstrates the test runner is
  correctly wired.
- [ ] No service, infrastructure, or browser scaffold is added.

## Non-goals

- Scheduling rules beyond the smoke test, HTTP routes, persistence,
  authentication, deployment, or release tagging.

## Data-model impact

None.

## Service and container impact

None. This completed ticket keeps scheduler-core a pure package with no
runnable service, Docker image, or Compose topology.

## Risk level

Low.

## Suggested checks

- Clean-environment install.
- Formatter, linter, and test commands.
- Package import test.
- GitHub PR run that reports the expected quality check.
