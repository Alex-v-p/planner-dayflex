# TKT-023: Add optional AI schedule explanations

**Status:** Planned
**Depends on:** TKT-018, TKT-022

## Goal

Extend the existing `services/ai` runtime with a friendly optional explanation
of an existing deterministic scheduling decision without replacing the
scheduler's decision codes, facts, or deterministic wording.

## User story

As a user, I can ask why work moved or did not fit and receive a calm explanation
grounded in the actual schedule result, while the real scheduling outcome
remains clear and usable without AI.

## Scope

- Add an internal explanation request/response contract to the AI service that
  accepts only approved structured scheduler facts and decision reason codes.
- Add the schedule-explanation use case and provider prompting behind the
  existing provider boundary in `services/ai/`.
- Extend the existing mock and disabled providers with deterministic explanation
  behavior for automated tests and fallback paths.
- Extend the existing API-owned AI-service client and add the browser-facing API
  endpoint/use case needed to request an explanation.
- Add a contextual explanation panel to the revised-plan experience.
- Keep deterministic scheduler reason text visible before, during, and after an
  AI request and whenever AI is disabled, times out, is unreachable, or returns
  invalid output.
- Update the existing AI-service, API, and browser test suites and CI checks for
  the new explanation capability.

## Acceptance criteria

- [ ] Explanation requests sent to `services/ai/` contain only the approved
  structured scheduler facts and decision reason codes needed for the response.
- [ ] Explanations are grounded in supplied facts and reason codes and do not
  invent constraints, schedule changes, or user intent.
- [ ] Deterministic reason text remains visible and usable without a model
  response.
- [ ] The explanation panel clearly distinguishes optional AI wording from the
  actual deterministic scheduling result.
- [ ] The browser continues to call only `services/api/`; it never calls
  `services/ai/` or a model provider directly.
- [ ] API-to-AI calls use bounded timeouts and fall back safely for disabled AI,
  connection failure, timeout, non-success responses, and invalid output.
- [ ] Tests use the existing mock provider and cover successful explanations,
  each core reason-code family, timeout, unreachable-service, and
  invalid-output fallback.
- [ ] No raw prompts, private user data, credentials, or complete model
  inputs/outputs are logged by default.
- [ ] Existing task and interruption parsing behavior from TKT-022 remains
  unchanged.

## Non-goals

- Creating or restructuring the AI runtime, moving parsing between services,
  changing schedules through chat, long-lived conversation history, using AI to
  override priority/deadline rules, direct browser-to-AI access, shared Compose
  topology, or adding a model container.

## Data-model impact

None. Do not persist raw prompts, model conversations, or explanation history.

## Service and container impact

Existing services only: extend the `services/ai/` runtime created by TKT-022
with schedule-explanation contracts and execution, and extend the existing
`services/api/` client/orchestration path. Do not create another runtime or
change the established service boundary.

The existing AI image may be rebuilt as part of normal verification because its
application code changes, but this ticket adds no new image definition, shared
Compose service, network alias, reverse-proxy route, or model runtime. TKT-025
remains responsible for local multi-service wiring.

## Risk level

Medium — grounded generation, private schedule context, and fallback behavior
across an existing internal service boundary.

## Suggested checks

- AI-service contract/fixture tests for every core scheduler reason-code family.
- API client tests for successful, disabled, timeout, unavailable, non-success,
  malformed, and schema-invalid explanation results.
- Browser tests for loading, successful explanation, deterministic fallback,
  and inaccessible AI-service states.
- Regression tests for TKT-022 task and interruption parsing.
- Captured-log tests proving prompts, private schedule facts, provider payloads,
  and credentials are absent.
