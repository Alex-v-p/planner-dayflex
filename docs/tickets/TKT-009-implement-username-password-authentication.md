# TKT-009: Implement username/password authentication

**Status:** Planned
**Depends on:** TKT-008

## Goal

Provide a secure, minimal account and session flow that establishes the user
identity used to own all future planning data.

## User story

As a user, I can register, sign in with a username and password, sign out, and
retrieve my current account without exposing anyone else's data.

## Scope

- Implement the `users` and `auth_sessions` schema described in the data model.
- Add registration, login, logout, and current-user API endpoints.
- Use a maintained Argon2id password-hashing library and opaque, revocable
  secure-cookie sessions.
- Apply generic login errors, safe logging, and rate limiting for authentication
  attempts.

## Acceptance criteria

- [ ] Usernames follow the documented normalization, uniqueness, and format
  rules.
- [ ] Plaintext passwords, session tokens, and password hashes never appear in
  logs, API responses, or database fields other than `password_hash`/token hash.
- [ ] Login creates a valid session; logout and password change revoke it.
- [ ] Protected endpoints can obtain a user identity from the session.
- [ ] Unknown usernames and wrong passwords receive indistinguishable failures.
- [ ] Tests cover registration, duplicate usernames, login, logout, revocation,
  and unauthorized access.

## Non-goals

- Email verification, password recovery, MFA, social login, or roles beyond
  “a user owns their own data.”

## Data-model impact

Added: `users` and `auth_sessions` tables, unique normalized username index,
and session-expiry/revocation fields.

## Service and container impact

Application API service: adds authentication to the existing API ownership
boundary. It adds no separately deployable service, Docker image, or Compose
topology.

## Risk level

High — authentication and authorization boundary.

## Suggested checks

- Authentication integration tests with a test database.
- Security review of cookies, rate limits, logs, and ownership middleware.
