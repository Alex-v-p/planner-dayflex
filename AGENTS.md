# AGENTS.md

## Project mode

This is a production-style solo project using AI agents.

The workflow is:

1. Human creates or starts a ticket.
2. The orchestrator agent coordinates planning, implementation, testing, review, and PR preparation on a ticket branch based on `develop`.
3. Agents may create ticket branches and pull requests, but never commit directly to protected branches.
4. Agents must never merge pull requests.
5. Human reviews and merges.
6. Ticket pull requests merge into `develop`; a human-approved release pull request moves `develop` into `main`.
7. Deployment runs from `main` once deployment has been configured.

The orchestrator owns a ticket from planning through PR preparation. It must
continue the repair, validation, commit, push, and re-review loop after every
finding; applying one fix is a checkpoint, not a reason to stop. It may pause
only for a human-only action, a decision that materially changes ticket scope,
or an external blocker it cannot safely resolve.

## Product and architecture context

`planner-dayflex` is a daily planner whose core value is recovery after real
life disrupts a plan. Fixed events reserve time; flexible tasks are scheduled
around them; interruptions cause unfinished work to be reconsidered for the
remaining day.

Before shaping or implementing a product ticket, read the relevant documents:

- `docs/product/vision.md`
- `docs/product/mvp-scope.md`
- `docs/architecture/overview.md`
- `docs/architecture/scheduling.md`
- `docs/architecture/scheduler-decisions.md`
- `docs/architecture/data-model.md`
- `docs/architecture/authentication.md`
- `docs/architecture/testing-strategy.md`
- `docs/architecture/implementation-sequence.md`
- `docs/architecture/delivery-workflow.md`
- `docs/architecture/versioning.md`
- `docs/architecture/repository-structure.md`
- `docs/product/canonical-day.md`

Product constraints:

- The MVP is day-focused. Week and month surfaces summarize saved daily plans;
  they are not multi-day optimization.
- Scheduling must be deterministic, explainable, and independent of AI.
- AI may parse natural-language input, suggest defaults, or word explanations.
  It must not make the final scheduling decision.
- Immediate rescheduling after an interruption must stay useful when AI and
  background processing are unavailable.
- Treat useful free-time windows as schedule results, not empty space to hide.
- Use calm, non-judgmental language for deferrals and missed work.

For visual interface tickets, inspect `docs/design/inspiration/` when it
contains relevant references. Treat screenshots as inspiration and never as a
license to copy another product's interface verbatim.

For interface design tickets, apply `docs/design/ui-ux-rules.md`,
`docs/design/component-boundaries.md`, and the relevant workflow docs in
`docs/design/`. Keep reusable style, component ownership, shell/body
separation, accessibility, responsive behavior, and visual QA proportionate to
the ticket scope.

Architecture documents describe an intentionally unimplemented proposed
direction. Do not create its service folders, dependencies, or infrastructure
until a scoped ticket confirms the needed first increment.

Use `docs/architecture/repository-structure.md` as the default location guide
when a ticket needs new code. It provides stable ownership boundaries without
requiring empty scaffolding. Any intentional exception must be explained in the
ticket plan and reviewed by the architect.

Preserve service boundaries and maintainability throughout the MVP. Add a
separate service only when it owns a concrete responsibility and stable
contract; do not turn a pure package or an in-process feature into a networked
service without a ticketed reason. Keep business rules in their owning domain,
communicate across service boundaries through explicit contracts, and do not
bypass an owning service to reach its data store, queue, or model runtime.

## Core rule

Do not implement vague requests directly.

Every code change must be connected to one ticket from either:

- a GitHub Issue
- `docs/tickets/TKT-xxx-name.md`

## Implementation delegation

The orchestrator coordinates work; it is not the ticket implementer. After the
plan is approved, `implementer` owns the complete initial delivery: source
code, configuration, infrastructure definitions, documentation, baseline
tests, and CI changes. `tester` independently owns test-only coverage,
fixtures, and test-only CI wiring. A P0/P1 behavior or deliverable defect returns
to `implementer`; a missing or inadequate test-only check returns to `tester`.
The orchestrator must not edit an implementation deliverable itself merely
because it has the ability to do so.

The only exception is when the current environment has no subagent capability
available. In that case, the orchestrator may make the minimum necessary
in-scope changes directly, but must record the unavailable capability and the
exception in the ticket plan and PR summary. Availability, convenience, or a
small documentation/configuration change are not exceptions.

## Service and container expectations

- Every ticket must state its service-boundary and container impact, including
  `None` when it changes only a pure package or documentation.
- A ticket that introduces an independently runnable service, durable store,
  queue, reverse proxy, or multi-service connection must explain the owner,
  public and internal interfaces, configuration and secret handling, health
  behavior, and Docker/Compose impact before implementation.
- Keep a service's image definition alongside that service when it exists; keep
  shared local topology and Compose material under `infra/`. Compose must not
  expose internal stores or internal-only services to the browser by default.
- Container work needs proportionate verification: validate the Compose
  configuration, build changed images, and run health/connection smoke checks
  for affected services. Add practical checks to CI in the same ticket, or
  record the specific reason they cannot run there.
- Do not add Docker files merely to satisfy process. Pure libraries, including
  `packages/scheduler-core`, stay directly testable without a container until a
  scoped ticket establishes a real runtime boundary.

## Interface design expectations

- Use the post-MVP design tickets TKT-027 through TKT-032, or a later explicit
  interface ticket, for visual redesign work.
- Prefer shared primitives and theme tokens over page-specific styling.
- Keep persistent shell concerns separate from feature route bodies.
- Keep scheduler facts and API orchestration out of generic presentation
  components.
- Make important schedule and recovery states distinguishable without relying
  on color alone.
- Cover the responsive, accessibility, and state variants touched by the
  ticket.

## Human-only actions

Agents must not:

- merge PRs
- approve PRs
- deploy manually
- bypass CI
- disable tests
- push directly to `main`
- push directly to `develop`
- change branch protection
- modify repository secrets
- add paid services without approval
- add production dependencies without explanation
- change authentication/authorization patterns without explicit ticket scope

## Required workflow for coding tickets

For each ticket:

1. Understand the ticket.
2. Create or confirm a small implementation plan.
3. Identify affected files. If the data model is affected, explicitly list the
   tables, fields, or constraints being added, changed, or removed; state the
   migration, backfill, and rollback implications.
   For interface design tickets, also identify affected shell, route body,
   shared UI, and feature components.
4. Create or confirm a `tkt-ISSUE_NUMBER-short-title` working branch from
   `develop`.
5. Delegate the complete initial delivery to `implementer`, including source,
   configuration, infrastructure, documentation, baseline tests, and CI. Use a
   direct implementation exception only as documented in
   [Implementation delegation](#implementation-delegation).
6. Delegate any test-only coverage, fixtures, or test-only CI wiring to
   `tester`, then run relevant checks.
   When a ticket introduces a new runnable test, lint, build, contract, or
   migration check, update CI in the same ticket so the check runs on pull
   requests when practical.
7. Commit each coherent, verified milestone to the working branch and push it
   before handing work to the next agent. Do not make empty commits, include
   secrets, force-push, or combine unrelated work.
8. Ask a reviewer agent to inspect the diff against `develop`.
9. Route P0/P1 findings back to the specialist best able to resolve them, then
   re-check, commit, push, and review again. The orchestrator must carry on
   through every repair cycle until no P0/P1 findings remain; it must not return
   control after the first fixed finding or a partial milestone. Do not merely
   report a blocking finding as complete.
10. Prepare the prose-first PR summary using `.github/pull_request_template.md`
    and open or update a PR targeting `develop`.

## Definition of done

A ticket is done only when:

- acceptance criteria are satisfied
- relevant tests exist
- formatting/linting passes
- build passes
- CI is expected to pass
- no P0/P1 reviewer findings remain
- PR description includes testing notes
- risk level is documented
- data-model impact is explicitly documented, or marked `None`
- Interface design tickets document responsive and accessibility checks, component
  ownership, and any visual QA that cannot run in CI
- release PRs document the proposed version increment and changelog impact

## Branch, commit, and remediation policy

- `main` is the protected production branch. It accepts only release PRs from
  `develop` and is never an agent working branch.
- `develop` is the protected integration branch. Ticket branches start from it
  and merge back through reviewed PRs only.
- A ticket branch uses `tkt-ISSUE_NUMBER-short-title` and has one ticket scope.
- Commits should be small, meaningful checkpoints: for example, a tested model
  change, a tested behavior change, or a discrete P0/P1 correction. Push each
  verified checkpoint to the ticket branch so the PR and agents share the same
  state.
- When a tester or reviewer finds a P0/P1 issue, the orchestrator classifies it
  before re-delegating: requirements ambiguity goes to `product_planner`;
  design, boundary, or security risk goes to `architect`; code defects go to
  `implementer`; behavior or deliverable defects in source, configuration,
  infrastructure, documentation, baseline tests, or CI go to `implementer`;
  missing or incorrect test-only coverage, fixtures, or test-only CI wiring go
  to `tester`; release readiness goes to `release_manager`.
- After the delegated fix, run the affected checks, commit and push the result,
  then ask the original checking agent to verify it again. Repeat until no
  P0/P1 finding remains. If the same finding survives two repair cycles, or
  resolving it changes ticket scope, stop and ask the human for direction.

## Review guidelines

Treat these as P1 or higher:

- missing authentication
- missing authorization
- missing server-side validation
- unsafe database access
- accidental logging of private data
- hardcoded secrets
- data deletion without confirmation
- disabled or weakened tests
- a new testable capability that is omitted from CI without an explicit reason
- a changed service boundary that permits direct access to an internal
  dependency or lacks an explicit contract
- a changed Compose/container topology without configuration validation, image
  build coverage, or proportionate health/connection checks
- Interface layout that hides primary planner actions, creates incoherent overlap,
  clips text or controls at supported widths, or leaves a primary calendar
  surface blank
- color-only communication of schedule or recovery status
- keyboard traps, missing accessible names, invisible focus, or broken focus
  return in UI workflows
- shell components that contain feature business logic, duplicate route body
  responsibilities, or bypass documented component boundaries
- unrelated rewrites
- broken migrations
- missing tests for important behavior
