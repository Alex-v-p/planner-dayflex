# MVP authentication design

## Scope

The MVP uses a simple username-and-password account. It is deliberately not a
social-login, email-verification, password-reset, or multi-factor flow. Those
features require their own security-scoped ticket.

Each user owns only their own planning data. Authentication establishes the
user ID used to scope every read and write.

## Account and password rules

- A username is required, unique after trim-and-lowercase normalization, and
  uses 3–32 lowercase ASCII letters, digits, `_`, or `-`.
- A password is required and must be 12–128 characters. Do not impose arbitrary
  composition rules that discourage passphrases.
- Store only an Argon2id password hash created by a maintained password-hashing
  library. The library must generate a unique salt; application code must never
  store, log, compare, or transmit a plaintext password after verification.
- Do not use reversible encryption or a fast general-purpose hash such as SHA-256
  for password storage.
- Return generic login failures so an attacker cannot distinguish an unknown
  username from a wrong password.

## Session behavior

- Provide registration, login, logout, and a current-user endpoint.
- On successful login, issue an opaque random session token. Store only its hash
  in `auth_sessions` and deliver the token in an `HttpOnly`, `Secure` in
  production, `SameSite=Lax` cookie.
- Expire and revoke sessions server-side on logout and password change.
- Rate-limit failed registration and login attempts. Never log passwords,
  session tokens, or password hashes.

## Implementation boundaries

- Use established framework/library primitives for password hashing, secure
  cookies, and constant-time verification; do not implement cryptography.
- Every authenticated API query filters by the session's `user_id`. Never trust
  a user ID supplied by the browser to authorize a resource.
- Authentication and authorization tests are required before any planning data
  is persisted for more than one user.
- Password reset, account recovery, email verification, MFA, and third-party
  identity providers remain out of scope until separately designed.
