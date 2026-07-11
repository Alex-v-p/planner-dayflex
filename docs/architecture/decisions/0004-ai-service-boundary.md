# ADR 0004: AI service process boundary

## Status

Accepted for TKT-022.

## Context

Planner input parsing is useful only when it stays optional. The deterministic
scheduler must remain responsible for final schedule decisions, and normal
planning must continue when AI is disabled, slow, unavailable, or returns an
invalid response.

## Decision

Create `services/ai` as an independently runnable FastAPI service that owns
optional natural-language parsing and all direct AI/model provider access.
Browsers continue to call only `services/api`; the API calls `services/ai`
through a typed internal HTTP client and maps all unavailable or invalid AI
paths to an explicit fallback result.

The shared parse result contract is:

- `status`: `suggested` or `fallback`
- `confidence`: number from `0.0` to `1.0`
- `proposed_fields`: typed task or interruption proposal object
- `fallback_reason`: `ai_disabled`, `service_unavailable`, `timeout`,
  `provider_error`, `invalid_response`, `unable_to_parse`, or `null`
- `error_code`: stable machine code or `null`

`services/ai` owns `PLANNER_AI_*` configuration: provider enablement, provider
selection, model, optional provider base URL, optional credential, provider
timeout, and log level. `services/api` owns only
`PLANNER_API_AI_SERVICE_BASE_URL` and `PLANNER_API_AI_CLIENT_TIMEOUT_SECONDS`.

## Health and Logging

`GET /health` on `services/ai` is dependency-free process liveness. Disabled or
failed providers do not make health fail; those states are represented in
per-request fallback results.

AI logs are JSON and allowlist service-controlled event names only. Raw prompts,
user text, provider payloads, credentials, request URLs, query strings, and
exception text are not logged.

## Container Impact

`services/ai` owns its local `Dockerfile` and `.dockerignore`. This ticket does
not add Compose wiring, shared network aliases, reverse-proxy routes, model
runtime containers, or browser access to the AI service.

TKT-025 will add shared local Compose networking and any optional local model
runtime wiring.

## Consequences

The API and browser remain usable without AI. The API can validate one stable
browser-facing contract while the AI service can evolve provider adapters
behind its own boundary. Provider SDK dependencies are deferred until a scoped
ticket chooses a live provider.
