# TKT-027: Release versioning and CD automation

**Status:** Planned
**Depends on:** TKT-026

## Goal

Automate release versioning, tagging, and deployment after the MVP is
operationally ready. CI is intentionally not introduced here: it begins in
TKT-002 and evolves with every testable capability.

## Context

The repository already has a `ticket branch` -> `develop` -> `main` flow and a
version policy. By this point, CI should already validate formatter, linter,
unit, build, contract, migration, and practical smoke checks appropriate to the
implemented stack. This ticket connects a successful human-approved release to
the version tag and deployment path.

## Acceptance criteria

- [ ] One authoritative application version source is added and documented.
- [ ] Release PRs from `develop` to `main` update that version and the
  changelog/release notes according to `docs/architecture/versioning.md`.
- [ ] Existing CI remains required and passes before any release action runs.
- [ ] A successful human-merged release tags the exact `main` commit as
  `vMAJOR.MINOR.PATCH`.
- [ ] Deployment uses approved environments/secrets, includes rollback guidance,
  and records post-deploy verification.
- [ ] CD workflows use least privilege and never print secrets.

## Non-goals

- Adding or deferring CI checks that belong with earlier implementation tickets.
- Implementing new planner features.
- Choosing a hosting provider, adding paid services, or removing the human
  release-merge decision without explicit approval.

## Data-model impact

None.

## Service and container impact

Release verification: verifies release and deployment behavior for existing
services and images. It creates no new runnable service or topology.

## Risk level

High — release integrity, deployment, and repository secrets.

## Suggested checks

- Release PR has the expected version, changelog, and passing CI checks.
- Test release tag points to the exact merged `main` commit.
- Deliberate deployment failure demonstrates secret safety and rollback path.
