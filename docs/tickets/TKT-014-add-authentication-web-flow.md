# TKT-014: Add the authentication web flow

**Status:** Planned
**Depends on:** TKT-009, TKT-013

## Goal

Give users a focused registration, sign-in, sign-out, and session-restoration
experience backed by the authentication API.

## User story

As a new or returning user, I can create an account or sign in, then reach only
my own planner workspace.

## Scope

- Add registration and sign-in pages with username/password validation.
- Integrate secure cookie-session endpoints and current-user restoration.
- Add an authenticated route guard and sign-out action.
- Present generic sign-in failures without revealing account existence.

## Acceptance criteria

- [ ] Registration, sign-in, session restore, sign-out, and protected-route
  behavior work against the API.
- [ ] Password inputs are never persisted in browser storage or shown in logs.
- [ ] Error states are clear without leaking username existence.
- [ ] Focus management, labels, keyboard submission, and mobile layout are
  accessible.
- [ ] Component and browser-flow tests cover core authentication paths.

## Non-goals

- Password reset, email confirmation, MFA, profile editing, or social login.

## Data-model impact

None; consumes the authentication contract from TKT-009.

## Service and container impact

Browser/API only: consumes the existing API authentication contract. It adds no
new runnable service, Docker image, or Compose topology.

## Risk level

High — browser authentication boundary.

## Suggested checks

- Authenticated/unauthenticated route tests.
- Browser test confirming no credentials land in local/session storage.
