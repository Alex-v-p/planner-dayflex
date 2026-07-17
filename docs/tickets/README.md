# Ticket roadmap

These tickets are intentionally ordered by dependency, not by how exciting a
screen may be. A ticket is ready only when its dependencies are merged into
`develop`; a later ticket may be refined when its predecessor reveals a better
small design.

| Phase | Tickets | Outcome |
| --- | --- | --- |
| Foundation | TKT-001–TKT-002 | Published repository rules, scheduler-core toolchain, and evolving CI baseline |
| Deterministic contracts | TKT-003 | Framework-free scheduler contracts and validation |
| Workflow hardening | TKT-004 | Reliable agent remediation, prose-first PR reporting, and service/container guidance before further feature work |
| Deterministic planning | TKT-005–TKT-007 | A standalone, deterministic daily scheduler and transport boundary |
| Application backend | TKT-008–TKT-012 | Secure user accounts, persisted planning data, and a complete planning API |
| Web MVP | TKT-013–TKT-021 | A usable responsive daily-planning and recovery experience |
| Optional enrichment | TKT-022–TKT-024 | AI assistance and background work that never control immediate scheduling |
| Operations | TKT-025–TKT-026 | Local multi-service topology and end-to-end hardening |
| Post-MVP UI/UX correction | TKT-027–TKT-032 | Calendar-style planner shell, daily schedule redesign, contextual editing, recovery clarity, summary redesign, and visual QA |
| Calendar interaction hardening | TKT-033-TKT-037 | Unified day/week/month calendar modes, direct grid creation, first-class interruption entry, plain-language status copy, and automatic plan refresh |

## Working rules

- Use one ticket branch per ticket, based on `develop`.
- Keep the ticket's stated non-goals intact. Split newly discovered work into a
  follow-up ticket instead of silently expanding scope.
- Complete the **Data-model impact** section in the ticket and PR even when it
  is `None`.
- The acceptance criteria are the definition of “small complete change” for
  that ticket; do not add unrelated cleanup merely because a file is nearby.

- The orchestrator owns a ticket through final review and PR preparation. A
  repaired review finding starts the next validation/review cycle; it does not
  end the ticket.
- Every ticket must include a **Service and container impact** section. State
  `None` for documentation or pure-package work. Otherwise name the affected
  service owner and boundary, why a separate process is warranted, contract and
  configuration/secret implications, Docker/Compose/network exposure changes,
  and the configuration, image-build, health, or connection checks to run.
- Keep services cohesive and maintainable: domain rules stay with their owner,
  cross-service interactions use explicit contracts, and no caller bypasses an
  owning service to access its infrastructure dependency.

## Ticket planning template

Include these sections in a durable ticket in addition to its goal, scope,
acceptance criteria, non-goals, data-model impact, risk level, and suggested
checks:

```md
## Service and container impact

None — [why this ticket has no independently runnable service or topology
change].
```

For a service or topology change, replace `None` with the service owner and
responsibility, affected contracts, configuration/secret source, container and
network exposure, and exact validation to add. This makes the choice reviewable
without requiring Docker for every ticket.

## Deferred ideas

Calendar synchronisation, recurring habit systems, social features, native
mobile applications, payments, advanced notifications, cross-day schedule
optimization, and release/CD automation remain outside this roadmap unless the
human owner adds a new ticket after the MVP.
