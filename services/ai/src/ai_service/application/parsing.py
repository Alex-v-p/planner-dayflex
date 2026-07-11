"""Use cases for optional input parsing."""

from __future__ import annotations

from typing import Protocol

from ai_service.contracts.parsing import (
    FallbackReason,
    ParseInterruptionRequestDTO,
    ParseInterruptionResultDTO,
    ParseTaskRequestDTO,
    ParseTaskResultDTO,
    interruption_fallback,
    task_fallback,
)


class ParseProvider(Protocol):
    """Provider boundary for natural-language parsing."""

    def parse_task(self, request: ParseTaskRequestDTO) -> ParseTaskResultDTO:
        """Return a validated task proposal or fallback."""

    def parse_interruption(
        self, request: ParseInterruptionRequestDTO
    ) -> ParseInterruptionResultDTO:
        """Return a validated interruption proposal or fallback."""


class ParseApplication:
    """Thin application layer around the provider boundary."""

    def __init__(self, provider: ParseProvider) -> None:
        self._provider = provider

    def parse_task(self, request: ParseTaskRequestDTO) -> ParseTaskResultDTO:
        """Parse a task without letting provider failures block planning."""
        try:
            return self._provider.parse_task(request)
        except TimeoutError:
            return task_fallback(FallbackReason.TIMEOUT, "provider_timeout")
        except Exception:
            return task_fallback(FallbackReason.PROVIDER_ERROR, "provider_error")

    def parse_interruption(
        self, request: ParseInterruptionRequestDTO
    ) -> ParseInterruptionResultDTO:
        """Parse an interruption without letting provider failures block recovery."""
        try:
            return self._provider.parse_interruption(request)
        except TimeoutError:
            return interruption_fallback(FallbackReason.TIMEOUT, "provider_timeout")
        except Exception:
            return interruption_fallback(
                FallbackReason.PROVIDER_ERROR, "provider_error"
            )
