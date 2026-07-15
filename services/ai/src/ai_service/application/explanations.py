"""Use cases for optional schedule explanations."""

from __future__ import annotations

from typing import Protocol

from ai_service.contracts.explanations import (
    ExplainScheduleDecisionRequestDTO,
    ExplainScheduleDecisionResultDTO,
    explanation_fallback,
)
from ai_service.contracts.parsing import FallbackReason


class ExplanationProvider(Protocol):
    """Provider boundary for schedule decision explanations."""

    def explain_schedule_decision(
        self, request: ExplainScheduleDecisionRequestDTO
    ) -> ExplainScheduleDecisionResultDTO:
        """Return grounded wording or fallback."""


class ExplanationApplication:
    """Thin application layer around the provider boundary."""

    def __init__(self, provider: ExplanationProvider) -> None:
        self._provider = provider

    def explain_schedule_decision(
        self, request: ExplainScheduleDecisionRequestDTO
    ) -> ExplainScheduleDecisionResultDTO:
        """Explain without letting provider failures block planning."""
        try:
            return self._provider.explain_schedule_decision(request)
        except TimeoutError:
            return explanation_fallback(FallbackReason.TIMEOUT, "provider_timeout")
        except Exception:
            return explanation_fallback(FallbackReason.PROVIDER_ERROR, "provider_error")
