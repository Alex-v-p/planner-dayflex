# TKT-004: Strengthen agent workflow and container guidance

**Status:** In progress
**Depends on:** TKT-003

## Goal

Make the repository workflow reliably carry each ticket through remediation and
PR preparation, while making pull-request reporting, service boundaries,
maintainability, and container validation explicit and consistent.

## Context

Recent review remediation stopped after a single repaired finding instead of
continuing through the remaining verification and review loop. The existing PR
template also presented status facts as checkboxes, obscuring useful review
information. The repository needs clearer, proportional guidance for Docker,
Compose, and separately runnable services without prematurely containerizing
the pure scheduler core.

## Scope

- Require the orchestrator to continue repair, validation, and re-review cycles
  until the ticket reaches a legitimate terminal condition.
- Require the orchestrator to delegate complete initial delivery to the
  implementer after planning: source, configuration, infrastructure,
  documentation, baseline tests, and CI. Reserve independent test-only
  coverage, fixtures, and test-only CI wiring for the tester. Permit direct
  orchestration edits only when no subagent capability is available and require
  that exception to be documented.
- Replace the PR template with a prose-first summary matching the repository's
  desired review style.
- Add ticket, agent-role, review, delivery, architecture, and testing guidance
  for explicit service ownership, maintainability, Docker/Compose boundaries,
  and proportionate container checks.

## Acceptance criteria

- [ ] Repository and agent-role instructions say a repaired finding is not a
  terminal condition and require continued review/repair cycles through PR
  preparation.
- [ ] Repository and orchestrator instructions require delegation of the
  complete initial delivery to the implementer for approved in-scope source,
  configuration, infrastructure, documentation, baseline tests, and CI; they
  assign test-only coverage, fixtures, and test-only CI wiring to the tester;
  they prohibit direct orchestrator implementation for convenience and document
  the no-subagent-only exception.
- [ ] The PR template reports summary, acceptance criteria, validation, CI
  changes, risk, data-model impact, service/container impact, and review
  outcome without using workflow or classification checkboxes.
- [ ] New tickets require explicit service/container impact, including `None`
  when no runtime boundary changes.
- [ ] Documentation describes maintainable service ownership, explicit
  contracts, Docker/Compose exposure, and proportional configuration, image,
  health, and connection checks.
- [ ] The guidance keeps pure packages directly testable without requiring
  premature containers.

## Non-goals

- Adding Dockerfiles, Compose topology, services, dependencies, or production
  infrastructure before their scoped implementation tickets.
- Changing product behavior, scheduler contracts, authentication, or the data
  model.

## Data-model impact

None.

## Service and container impact

None — this ticket documents the conditions for future runtime boundaries; it
does not add an independently runnable service or topology.

## Risk level

Low — documentation and repository templates only. The main risk is process
ambiguity, mitigated by aligning all affected guidance and templates.

## Suggested checks

- Inspect Markdown and YAML syntax.
- Confirm the PR template contains no checkbox syntax for risk, workflow, or
  classification fields.
- Review the diff against `develop` for consistent service/container language.
