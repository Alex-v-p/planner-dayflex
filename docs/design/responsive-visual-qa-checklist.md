# Responsive visual QA checklist

TKT-032 adds automated DOM-based browser checks for the redesigned planner
surfaces. The CI check runs `npm run test:e2e:visual` from `apps/web`, using the
canonical initial and revised day fixtures at 360px, 768px, and 1280px widths.

## Automated coverage

- Daily workspace, initial canonical day: non-blank timeline, text overflow,
  document overflow, and schedule block overlap.
- Daily workspace, revised recovery day: non-blank timeline, interruption,
  moved-work and free-time labels, text overflow, document overflow, focus
  visibility, and schedule block overlap.
- Contextual task and fixed-event editors: visible dialogs, text overflow,
  document overflow, and focus visibility at each supported width.
- Week and month overviews: non-blank overview grids, summary status labels,
  selected-date focus visibility, text overflow, and document overflow.
- Free-time finder: useful-window, no-generated-plan, and no-useful-free-time
  states with text overflow, focus visibility, and document overflow.

## Manual review

Use these checks when reviewing the PR or a local build:

- Compare structure against `docs/design/inspiration/catalog.md`, borrowing the
  time-grid hierarchy, compact contextual editing, dense month grid, and
  glanceable summary ideas without copying third-party branding or exact
  screenshots.
- Review `/planner?date=2026-06-22`,
  `/planner/week?date=2026-06-22`, `/planner/month?date=2026-06-22`, and
  `/free-times?start_date=2026-06-22&end_date=2026-06-28&minimum_minutes=30`.
- On the daily workspace, open the flexible task editor and fixed-event editor
  before checking editor readability, focus visibility, and text fit.
- Check widths around 360px, 768px, and 1280px.
- Tab through schedule blocks, overview day links, and free-time result links;
  confirm focus stays visible and no keyboard trap appears.
- Confirm fixed, flexible, interrupted, buffered, free, moved, completed, and
  deferred states are identifiable with text labels or structural cues, not
  color alone.

Pixel-perfect screenshot matching to the inspiration images remains manual and
out of CI because the references are local, ignored by Git, and intended as
directional inspiration rather than source assets.
