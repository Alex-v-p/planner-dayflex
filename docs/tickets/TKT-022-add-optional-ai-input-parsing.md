# TKT-022: Add optional AI input parsing

**Status:** Planned
**Depends on:** TKT-012, TKT-021

## Goal

Offer optional, structured assistance for turning informal task and interruption
text into proposed fields while leaving the user and deterministic scheduler in
control.

## User story

As a user, I can describe work or lost time in ordinary language and receive
editable suggestions for duration, priority, timing, or interruption details.

## Scope

- Create `services/ai/` with explicit parse-task and parse-interruption
  contracts, provider boundary, configuration, and health endpoint.
- Add a deterministic mock provider for automated tests and disabled-AI fallback.
- Add API integration that returns proposed values/confidence without persisting
  or scheduling them until the user confirms.
- Add a small web affordance to request and edit suggestions in the existing
  task/interruption forms.

## Acceptance criteria

- [ ] AI requests and responses use typed, validated contracts with confidence
  or fallback information.
- [ ] Normal planning/recovery remains fully usable when AI is disabled, slow,
  unavailable, or returns invalid output.
- [ ] The browser presents suggestions as editable proposals, never as an
  automatic plan change.
- [ ] Automated tests use the mock provider and do not require a live model.
- [ ] AI inputs/outputs containing user text are handled without unsafe logging.

## Non-goals

- AI selection of schedule slots, background jobs, model-container deployment,
  or storing conversation history.

## Data-model impact

None; do not persist raw model conversations in the MVP.

## Service and container impact

AI provider integration in the existing API service: calls remain behind an
API-owned adapter and typed contract. It adds no standalone AI service, model
container, or Compose topology.

## Risk level

Medium — optional dependency and private user input.

## Suggested checks

- Contract tests for valid, ambiguous, and invalid model results.
- API fallback and UI editable-suggestion tests.
