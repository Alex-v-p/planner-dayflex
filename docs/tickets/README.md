# Ticket roadmap

These tickets are intentionally ordered by dependency, not by how exciting a
screen may be. A ticket is ready only when its dependencies are merged into
`develop`; a later ticket may be refined when its predecessor reveals a better
small design.

| Phase | Tickets | Outcome |
| --- | --- | --- |
| Foundation | TKT-001–TKT-002 | Published repository rules, scheduler-core toolchain, and evolving CI baseline |
| Deterministic planning | TKT-003–TKT-006 | A standalone, deterministic daily scheduler and transport boundary |
| Application backend | TKT-007–TKT-011 | Secure user accounts, persisted planning data, and a complete planning API |
| Web MVP | TKT-012–TKT-020 | A usable responsive daily-planning and recovery experience |
| Optional enrichment | TKT-021–TKT-023 | AI assistance and background work that never control immediate scheduling |
| Operations and release | TKT-024–TKT-026 | Local multi-service topology, end-to-end hardening, and release/CD automation |

## Working rules

- Use one ticket branch per ticket, based on `develop`.
- Keep the ticket's stated non-goals intact. Split newly discovered work into a
  follow-up ticket instead of silently expanding scope.
- Complete the **Data-model impact** section in the ticket and PR even when it
  is `None`.
- The acceptance criteria are the definition of “small complete change” for
  that ticket; do not add unrelated cleanup merely because a file is nearby.

## Deferred ideas

Calendar synchronisation, recurring habit systems, social features, native
mobile applications, payments, advanced notifications, and cross-day schedule
optimization remain outside this roadmap unless the human owner adds a new
ticket after the MVP.
