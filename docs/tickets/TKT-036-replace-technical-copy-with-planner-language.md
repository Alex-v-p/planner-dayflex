# TKT-036: Replace technical copy with planner language

**Status:** Planned
**Depends on:** TKT-027, TKT-030, TKT-031

## Goal

Remove backend terminology and low-value status noise from user-facing planner
surfaces so the app explains the day in normal planning language.

## User story

As a user, I see helpful labels like "Plan updated", "Moved later", and "Free
time" instead of technical words like "deterministic", "snapshot", or raw
reason-code phrasing.

## Context

The latest feedback calls out overview and status pages as full of non-useful
content and backend terminology. Terms that are useful to engineers can make
the product feel unfinished and get in the way of the planning task. The UI
should translate scheduler facts into calm, practical language while preserving
the facts for accessibility, tests, and optional details.

## Scope

- Audit authenticated planner routes, overview/status surfaces, empty states,
  error states, labels, summaries, tooltips, and dialogs for technical copy.
- Replace user-facing terms such as "deterministic", "snapshot",
  "scheduler", "reason code", "DTO", "version", or internal IDs when they are
  not necessary for the user's decision.
- Keep technical facts available only where they are genuinely useful, such as
  developer diagnostics, API errors intended for logs, or secondary details
  with plain-language framing.
- Redesign overview/status content to prioritize actionable planner questions:
  what is scheduled, what changed, what needs attention, and what useful free
  time remains.
- Add or centralize copy helpers that map scheduler reason codes and snapshot
  state into consistent user-facing text.
- Preserve calm, non-judgmental language for moved, missed, deferred, and
  interrupted work.

## Acceptance criteria

- [ ] Primary user-facing planner screens do not expose raw backend
  terminology as headings, labels, button text, empty-state copy, or summary
  descriptions.
- [ ] Overview and status surfaces prioritize actionable planning information
  over implementation details.
- [ ] Scheduler reason codes and snapshot states are mapped through consistent
  copy helpers rather than repeated ad hoc strings.
- [ ] Error messages distinguish user-fixable validation problems from retryable
  system failures without leaking internal IDs or stack-like language.
- [ ] Existing accessibility labels and live-region messages use the same
  plain-language vocabulary.
- [ ] Tests or snapshots that assert user-facing copy are updated intentionally.

## Non-goals

- Changing scheduler reason codes, removing structured facts from API
  contracts, hiding necessary validation details, adding AI-authored copy, or
  redesigning the full calendar layout beyond copy and information hierarchy.

## Data-model impact

None.

## Service and container impact

Browser/API only: changes presentation copy and possibly API error-to-UI
mapping. It adds no new runnable service, Docker image, or Compose topology.

## Risk level

Medium - copy changes can obscure important scheduler facts if the mapping is
too vague.

## Suggested checks

- Unit tests for reason-code and status copy helpers.
- Component tests for overview/status, recovery, empty, validation-error, and
  retry states.
- Manual copy review of planner routes at desktop and mobile widths.
