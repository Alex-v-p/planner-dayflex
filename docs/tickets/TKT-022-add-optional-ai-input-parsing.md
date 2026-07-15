# TKT-022: Establish the AI runtime and add optional AI input parsing

**Status:** Planned
**Depends on:** TKT-012, TKT-021

## Goal

Establish the independently runnable `services/ai` boundary and use its first
capability to turn informal task and interruption text into structured,
editable proposals while leaving the user and deterministic scheduler in
control.

## User story

As a user, I can describe work or lost time in ordinary language and receive
editable suggestions for duration, priority, timing, or interruption details,
without making AI availability a requirement for normal planning or recovery.

## Scope

- Create `services/ai/` as a separately runnable Python FastAPI service that
  owns optional natural-language processing and all direct AI-provider
  communication.
- Add explicit internal parse-task and parse-interruption request/response
  contracts with typed validation, confidence information, and structured
  fallback/error metadata.
- Add a pluggable provider boundary in `services/ai/` with provider-specific
  prompting kept behind the boundary.
- Add deterministic mock and disabled providers so automated tests and normal
  disabled-AI behavior do not require a live model.
- Add typed AI-service configuration sourced from environment variables,
  including provider enablement, provider/model selection, provider base URL or
  credentials, and bounded request timeouts.
- Add a dependency-free `GET /health` liveness endpoint. A disabled or
  temporarily unavailable model provider must not make the AI service process
  unhealthy; provider failures are represented in typed per-request results.
- Add an API-owned internal AI-service client with typed mapping, bounded
  timeouts, invalid-response handling, and deterministic fallback behavior.
  The browser must continue to call only `services/api/`.
- Add stable browser-facing API integration that returns proposed values,
  confidence, and fallback information without persisting or scheduling the
  proposal until the user confirms it.
- Add a small web affordance to request, review, and edit suggestions in the
  existing task and interruption forms.
- Add a service-local `Dockerfile` and `.dockerignore`, plus practical CI
  coverage for the AI service tests, a clean image build, and a mock-provider
  `/health` smoke check.
- Record the AI process boundary, ownership, contracts, configuration, health
  behavior, and deferred Compose wiring in an architecture decision record.

## Acceptance criteria

- [ ] `services/ai/` starts as an independent runtime and its dependency-free
  `GET /health` endpoint returns a successful liveness response.
- [ ] Only `services/ai/` communicates with an AI/model provider; neither the
  browser nor `services/api/` calls a model provider directly.
- [ ] The application API is the only browser-facing AI entry point and uses a
  typed internal client to call `services/ai/`.
- [ ] Parse-task and parse-interruption requests and responses use typed,
  validated contracts with confidence and fallback/error information.
- [ ] Normal planning and recovery remain fully usable when AI is disabled,
  slow, unreachable, times out, returns a non-success response, or produces
  invalid output.
- [ ] The browser presents suggestions as editable proposals and never applies
  them as an automatic plan or persistence change.
- [ ] Automated tests use the mock provider and do not require a live model.
- [ ] Provider credentials, raw prompts, private user text, and complete model
  inputs/outputs are not logged or returned by health endpoints.
- [ ] The AI service image builds from a clean context and a mock-provider
  container health smoke check passes.
- [ ] An ADR documents the new service boundary and states that TKT-025 will add
  shared Compose networking and any optional local model runtime.

## Non-goals

- AI selection of schedule slots, AI-generated schedule explanations,
  background jobs, long-lived conversation history, production deployment,
  shared Compose topology, or adding an Ollama/model container in this ticket.

## Data-model impact

None. Do not persist raw prompts, model conversations, or unconfirmed parsing
proposals in the MVP.

## Service and container impact

New AI runtime: create `services/ai/` as the owner of provider communication and
parse-task/parse-interruption execution. Its internal HTTP contracts are
consumed only by `services/api/`; the application API keeps stable browser DTOs,
validation, orchestration, and deterministic fallback behavior.

Configuration and secrets are environment-provided. The AI service owns
provider enablement, provider/model selection, provider base URL or credentials,
and provider request timeout. The API owns the AI service base URL and its
client timeout. Secret values and raw provider payloads must not appear in logs
or health responses.

Add a service-local image definition and verify a clean image build plus a
mock-provider liveness smoke check. Do not add shared Compose services, network
aliases, reverse-proxy routes, or a local model runtime here; TKT-025 will wire
the already-existing AI image into the local internal topology and ensure only
the AI service can reach an optional model runtime.

## Risk level

High — new process and network boundary, private user input, provider failure
handling, configuration/secrets, and browser-to-API-to-AI contract mapping.

## Suggested checks

- AI-service unit and contract tests for valid, ambiguous, and invalid task and
  interruption parsing results.
- API client tests for success, disabled AI, connection refusal, timeout,
  non-success status, malformed JSON, and schema-invalid output.
- Browser tests for editable suggestions, deterministic fallback, loading, and
  inaccessible AI-service states.
- Captured-log tests proving prompts, user text, provider payloads, and
  credentials are absent.
- Clean AI image build and mock-provider container `/health` smoke check.
