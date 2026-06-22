# TKT-021: Polish MVP accessibility and end-to-end flow

**Status:** Planned
**Depends on:** TKT-018, TKT-019, TKT-020

## Goal

Make the non-AI planner MVP dependable on desktop and mobile through focused
accessibility work, resilient states, and an end-to-end user-journey test.

## User story

As a user, I can reliably plan, recover, and inspect my time even on a narrow
screen or when a request fails temporarily.

## Scope

- Review and improve keyboard paths, focus handling, contrast, labels, screen
  reader announcements, and non-color status cues across MVP workflows.
- Standardize empty, loading, validation, network-error, and retry states.
- Add a browser end-to-end flow: register, add inputs, generate a plan, record
  progress, report interruption, and view revised/week/free-time results.
- Correct only defects uncovered in those supported flows.

## Acceptance criteria

- [ ] The core daily/recovery flow is keyboard usable and understandable
  without color alone.
- [ ] Supported layouts remain usable at agreed mobile and desktop widths.
- [ ] Core request failures have a visible recovery path and do not discard
  entered form data.
- [ ] One automated end-to-end flow covers the canonical user journey.
- [ ] No new product feature or visual redesign is introduced under “polish.”

## Non-goals

- AI assistance, native mobile apps, notifications, full design-system rewrite,
  or new planning features.

## Data-model impact

None.

## Service and container impact

Browser/API only: verifies and improves existing browser and API flows. It adds
no new runnable service, Docker image, or Compose topology.

## Risk level

Medium.

## Suggested checks

- Automated accessibility scan plus targeted keyboard review.
- Desktop/mobile browser smoke and canonical end-to-end test.
