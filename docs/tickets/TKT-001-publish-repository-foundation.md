# TKT-001: Publish the repository foundation

**Status:** Planned

## Goal

Make the existing project guidance, agent configuration, templates, and branch
workflow available on GitHub through a reviewed bootstrap PR into `develop`.

## User story

As the project owner, I need the shared repository rules to be visible to every
future agent and reviewer before application code begins.

## Scope

- Fetch the remote `develop` branch and create one bootstrap ticket branch.
- Add the existing documentation, `.codex` definitions, GitHub templates,
  placeholder workflows, and local-reference `.gitignore` policy.
- Open a PR from the bootstrap branch into `develop` with a concise summary.
- Confirm the issue form, PR template, and placeholder CI are visible after the
  PR is merged.

## Acceptance criteria

- [ ] All current repository guidance is committed on a branch based on
  `develop`, not pushed to `main`.
- [ ] The bootstrap PR targets `develop` and contains no local screenshots.
- [ ] `AGENTS.md`, all agent TOML files, product/architecture docs, ticket
  roadmap, issue form, PR template, and workflows are present on `develop`.
- [ ] The placeholder CI workflow runs successfully for the bootstrap PR.
- [ ] The human owner reviews and merges the PR.

## Non-goals

- Implementing application code or selecting the production stack.
- Enabling real deployment or treating placeholder checks as product CI.

## Data-model impact

None.

## Risk level

Low.

## Suggested checks

- TOML and YAML syntax checks.
- Confirm `docs/design/inspiration/screenshots/` is ignored by Git.
- Inspect the GitHub PR files and workflow run.
