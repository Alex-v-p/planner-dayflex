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

Architecture documents describe an intentionally unimplemented proposed
direction. Do not create its service folders, dependencies, or infrastructure
until a scoped ticket confirms the needed first increment.

Use `docs/architecture/repository-structure.md` as the default location guide
when a ticket needs new code. It provides stable ownership boundaries without
requiring empty scaffolding. Any intentional exception must be explained in the
ticket plan and reviewed by the architect.

## Core rule

Do not implement vague requests directly.

Every code change must be connected to one ticket from either:

- a GitHub Issue
- `docs/tickets/TKT-xxx-name.md`

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
4. Create or confirm a `tkt-ISSUE_NUMBER-short-title` working branch from
   `develop`.
5. Implement the smallest complete change.
6. Add or update tests and run relevant checks.
   When a ticket introduces a new runnable test, lint, build, contract, or
   migration check, update CI in the same ticket so the check runs on pull
   requests when practical.
7. Commit each coherent, verified milestone to the working branch and push it
   before handing work to the next agent. Do not make empty commits, include
   secrets, force-push, or combine unrelated work.
8. Ask a reviewer agent to inspect the diff against `develop`.
9. Route P0/P1 findings back to the specialist best able to resolve them, then
   re-check, commit, push, and review again. Do not merely report a blocking
   finding as complete.
10. Prepare a PR summary and open or update a PR targeting `develop`.

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
  `implementer`; missing or incorrect coverage goes to `tester`; release
  readiness goes to `release_manager`.
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
- unrelated rewrites
- broken migrations
- missing tests for important behavior
