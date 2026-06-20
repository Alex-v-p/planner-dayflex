# TKT-022: Add optional AI schedule explanations

**Status:** Planned
**Depends on:** TKT-017, TKT-021

## Goal

Offer a friendly optional explanation of an existing deterministic scheduling
decision without replacing the decision codes or facts shown to the user.

## User story

As a user, I can ask why work moved or did not fit and receive a calm explanation
grounded in the actual schedule result.

## Scope

- Add an explanation request/response contract that accepts only structured
  scheduler facts and reason codes.
- Implement AI-provider prompting/fallback behavior through the AI service.
- Add a contextual explanation panel in the revised-plan experience.
- Keep deterministic reason text available when AI is disabled or fails.

## Acceptance criteria

- [ ] Explanations are grounded in the supplied decision codes and schedule
  facts; they do not claim invented constraints.
- [ ] Deterministic fallback wording remains visible without a model response.
- [ ] The explanation panel clearly distinguishes a suggestion from the actual
  scheduling result.
- [ ] Tests use a mock provider and cover timeout/invalid-output fallback.
- [ ] No raw prompts or private user data are logged by default.

## Non-goals

- Changing schedules through chat, long-lived conversation history, or using AI
  to override priority/deadline rules.

## Data-model impact

None.

## Risk level

Medium.

## Suggested checks

- Contract/fixture tests for each core reason-code family.
- Browser test for fallback and successful explanation states.
