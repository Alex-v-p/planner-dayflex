# planner-dayflex

`planner-dayflex` is a forgiving daily planner for people whose days contain
both immovable commitments and work that has to flex around real life. Its
central job is to help someone recover a useful plan after an interruption,
not to punish them for having one.

Application services and the browser experience are intentionally not
initialized yet. The first implementation increment is the pure
[`scheduler-core`](packages/scheduler-core/README.md) package; its deterministic
rules will grow before any service or infrastructure is introduced.

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

The scheduler-core CI workflow runs its documented format, lint, and test
commands. Deployment remains a safe placeholder until a hosting platform is
chosen.
