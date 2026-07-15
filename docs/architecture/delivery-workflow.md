# Delivery workflow

## Branch roles

| Branch | Purpose | How it changes |
| --- | --- | --- |
| `main` | Protected production history and deployment source | Human merges a reviewed release PR from `develop` only |
| `develop` | Protected integration branch | Human merges reviewed ticket PRs into it |
| `tkt-ISSUE_NUMBER-short-title` | One ticket's working branch | Agents make verified commits and push only here |

Never commit or push directly to `main` or `develop`. A ticket branch starts
from the latest `develop` and its PR targets `develop`. A release PR is the only
normal path from `develop` to `main`.

## Ticket flow

```txt
GitHub Issue
  -> ticket branch from develop
  -> implement/test/commit/push checkpoints
  -> review and repair loop
  -> PR into develop
  -> human merge
  -> release PR: develop into main
  -> human merge and deployment
```

## Commit checkpoints

Commit after a small, coherent unit has relevant checks behind it. Good
checkpoints include a tested scheduler rule, a complete API behavior with its
tests, a UI behavior with its focused checks, or a P0/P1 repair. Each commit is
pushed to the ticket branch before another agent reviews or extends it.

Avoid empty commits, unrelated formatting sweeps, force-pushes, and credentials
or private data. A trivial one-file documentation correction may use a single
commit; a larger ticket should not wait until the end to preserve all work in
one opaque change.

## Finding recovery loop

Review and testing are active feedback loops. A P0/P1 finding is classified and
returned to the specialist with the right context:

| Finding type | Repair owner |
| --- | --- |
| Requirement is unclear or acceptance criteria conflict | Product planner |
| Architecture, data boundary, auth, authorization, or security design needs correction | Architect |
| Implementation behavior is incorrect | Implementer |
| Test coverage or assertion is missing/incorrect | Tester |
| Migration implementation, configuration, infrastructure, or post-deploy defect | Implementer |
| Release readiness, release notes, deployment notes, or migration/rollback planning | Release manager |

The release manager assesses delivery concerns, and the orchestrator routes delivery changes to the implementer.
The repair owner addresses only the finding and ticket scope. The orchestrator
runs the affected checks, commits and pushes the repair, then asks the original
reporter to recheck the updated diff. The loop continues until P0/P1 findings
are absent. A single repair or a clean intermediate check is never a terminal
condition: the orchestrator continues the ticket through final validation, PR
preparation, and all remaining review cycles without waiting for another prompt.
If a finding survives two repair cycles or needs a scope change, the
orchestrator pauses for a human decision.

## Pull-request description

Use `.github/pull_request_template.md`. A PR description is a concise report,
not a generic task checklist: write plain statements for the summary,
acceptance criteria, validation, CI changes, risk level, data-model impact, and
review outcome. Checkboxes belong only to genuine actions someone still needs
to complete, never to facts such as a risk classification, workflow role, or
branch target.

## Agent starter prompt

Use this prompt when starting an agent on a ticket. Replace the ticket number,
title, and path before sending it.

```txt
Complete TKT-XXX: Ticket title

Use the GitHub Issue or `docs/tickets/TKT-XXX-ticket-title.md` as the complete
scope of work. Follow `AGENTS.md` and all relevant product, architecture,
repository-structure, data-model, testing, versioning, delivery-workflow, and
ticket-specific documentation.

If the ticket changes the web interface, also apply the relevant docs in
`docs/design/`, inspect any cited inspiration catalog entries, and use
design_reviewer to review the design outcome before or alongside the general
reviewer.

Work from a ticket branch based on `develop`. If the ticket is unclear or
blocked by a missing decision, use product_planner or architect to propose a
clarification and stop before coding.

Otherwise: plan first, implement the smallest complete change, add or update
tests, keep CI aligned with practical new checks, and run relevant checks.

Commit work intermittently instead of waiting until the end. Use small,
coherent commits with clear semantic commit messages, such as `feat: persist
planning preferences`, `test: cover saved planning inputs`, or `fix: handle
missing preference defaults`. Each commit should represent a meaningful step in
the ticket and avoid mixing unrelated changes.

Use tester and reviewer after implementation. For interface design tickets, use
design_reviewer as well. Route P0/P1 findings back to the appropriate agent
until resolved, then re-run relevant checks and review again.

Open or update a draft PR targeting `develop`. Do not merge, push directly to
`develop` or `main`, broaden scope, weaken tests or CI, or change auth,
authorization, data-model, service-boundary, or container patterns without
explicitly documenting the impact. When using GitHub, use GitHub HTTPS, not
`gh`.

In the final response include: ticket handled, branch, commits, changes,
data-model impact, service/container impact, checks, CI changes, reviewer and
design-reviewer findings where relevant, remaining risks, and PR link.
```

## Service and container delivery

When a ticket introduces or changes a separately runnable service, its review
and PR description must identify the service owner, external and internal
contracts, configuration/secret source, health behavior, and the reason a
process boundary is useful. For Docker or Compose changes, run the applicable
configuration, image-build, and service health/connection checks before review;
add the practical version to CI with the ticket or explain why it cannot run
there. Pure packages do not need a container merely because future services may
consume them.

## GitHub protection

Protect both `develop` and `main` with pull-request-only changes, blocked
force-pushes, blocked deletion, and required CI once the workflow has run.
`main` should also require the release PR path. For a solo repository, human
review of the PR, the required checks, and Codex review are more practical than
requiring a separate approving GitHub user.
