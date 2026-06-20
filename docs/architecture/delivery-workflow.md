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
| Release, migration, configuration, or post-deploy concern | Release manager |

The repair owner addresses only the finding and ticket scope. The orchestrator
runs the affected checks, commits and pushes the repair, then asks the original
reporter to recheck the updated diff. The loop continues until P0/P1 findings
are absent. If a finding survives two repair cycles or needs a scope change, the
orchestrator pauses for a human decision.

## GitHub protection

Protect both `develop` and `main` with pull-request-only changes, blocked
force-pushes, blocked deletion, and required CI once the workflow has run.
`main` should also require the release PR path. For a solo repository, human
review of the PR, the required checks, and Codex review are more practical than
requiring a separate approving GitHub user.
