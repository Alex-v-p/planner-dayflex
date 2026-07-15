# TKT-032: Add responsive visual QA for the redesigned UI

**Status:** Planned
**Depends on:** TKT-028, TKT-029, TKT-030, TKT-031

## Goal

Prevent the redesigned planner UI from regressing into unreadable, overlapping,
or form-heavy screens by adding focused automated and manual visual checks.

## User story

As the product owner, I can trust that the redesigned planner keeps working and
looking coherent across the core day, recovery, summary, and free-time flows.

## Context

The UI tickets change the most visible parts of the app. Existing functional
tests prove core behavior, but the calendar-like layout also needs checks for
overlap, text overflow, responsive breakpoints, and accessible status cues.

## Scope

- Add stable visual or screenshot-oriented browser checks for the daily
  schedule, contextual editor, revised recovery plan, week overview, month
  overview, and free-time finder.
- Seed or mock deterministic planner data based on the canonical day so visual
  checks are repeatable.
- Cover a practical viewport matrix for desktop, tablet, and narrow mobile.
- Add assertions or checks for schedule block overlap, text overflow, focus
  visibility, and non-color status cues where practical.
- Document the manual review checklist for comparing the implemented UI against
  the inspiration catalog without requiring pixel-perfect copying.
- Add the practical check to CI, or document why any visual-only review remains
  manual.

## Acceptance criteria

- [ ] CI or documented local checks cover the redesigned daily workspace,
  recovery state, overview surfaces, and free-time finder at multiple widths.
- [ ] The canonical initial and revised day states are available as repeatable
  UI test fixtures or mocks.
- [ ] Checks catch obvious text overflow, incoherent overlap, blank calendar
  surfaces, and missing focus visibility.
- [ ] Accessibility checks remain part of the supported flow and include
  non-color status verification.
- [ ] The PR documents any visual QA that cannot run in CI and why.
- [ ] Existing functional end-to-end coverage remains active.

## Non-goals

- Pixel-perfect screenshot matching to third-party inspiration, broad browser
  matrix expansion, performance budgeting, or adding paid visual-regression
  services without approval.

## Data-model impact

None.

## Service and container impact

Browser/CI only: adds tests and documentation for existing Angular UI behavior.
It adds no new runnable service, Docker image, or Compose topology.

## Risk level

Medium - visual tests can become brittle if fixtures and assertions are too
broad.

## Suggested checks

- Playwright visual or screenshot smoke for key routes at desktop, tablet, and
  mobile widths.
- Automated accessibility scan for canonical planner and recovery states.
- CI run for web lint, unit tests, build, and the focused browser checks.
