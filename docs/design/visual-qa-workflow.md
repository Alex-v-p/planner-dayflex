# Skill: Visual QA workflow

Use this workflow when testing or reviewing UI tickets, especially TKT-028
through TKT-032.

## 1. Pick stable scenarios

Use deterministic data so visual checks are repeatable. Prefer:

- The canonical initial day from `docs/product/canonical-day.md`.
- The canonical revised day after interruption.
- A day with no generated plan.
- A summary range with planned days, empty days, deferred work, interruptions,
  and useful free time.
- A free-time search with results, no generated plan days, and no useful free
  time days.

## 2. Cover practical viewports

At minimum, review:

- Narrow mobile around 360px wide.
- Tablet around 768px wide.
- Desktop around 1280px wide.

Use additional widths when a ticket introduces a dense grid, sidebar, drawer,
or time-grid schedule.

## 3. Look for layout failures

Check for:

- Blank primary surfaces.
- Incoherent overlap between text, controls, or schedule blocks.
- Text clipped inside buttons, chips, grid cells, forms, or schedule blocks.
- Important actions pushed off-screen.
- Horizontal scrolling on normal mobile layouts unless the ticket explicitly
  designs a scrollable schedule region.
- Focus indicators hidden by sticky headers, modals, or overflow containers.

## 4. Look for comprehension failures

Check whether a user can tell:

- Which date and view are active.
- What is fixed, flexible, interrupted, buffered, free, moved, completed, or
  deferred.
- Whether a plan is initial or revised.
- Why work moved or did not fit.
- What action to take after a failure.

## 5. Automate what is stable

- Add component tests for reusable primitives and state-specific rendering.
- Add browser smoke tests for core route flows.
- Add screenshot or DOM-based overlap checks when the layout is dense and
  stable enough.
- Keep screenshot assertions focused. Do not require pixel-perfect matches to
  third-party inspiration.

## 6. Document manual review

When visual checks cannot run in CI, the PR must state:

- Which routes and states were reviewed.
- Which viewports were used.
- Which inspiration catalog entries informed the work.
- What risk remains.
