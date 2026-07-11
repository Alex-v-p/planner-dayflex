"""HTTP client boundary for optional AI parsing."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal, Protocol

import httpx
from typing import Self

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator


FallbackReason = Literal[
    "ai_disabled",
    "service_unavailable",
    "timeout",
    "provider_error",
    "invalid_response",
    "unable_to_parse",
]


class TaskProposalDTO(BaseModel):
    """AI service task proposal shape."""

    model_config = ConfigDict(extra="forbid")

    title: str | None = None
    estimated_minutes: int | None = None
    priority: int | None = None
    due_date: date | None = None
    earliest_start_at: datetime | None = None
    splitting_allowed: bool | None = None
    min_segment_minutes: int | None = None


class InterruptionProposalDTO(BaseModel):
    """AI service interruption proposal shape."""

    model_config = ConfigDict(extra="forbid")

    start_at: datetime | None = None
    end_at: datetime | None = None
    time_zone: str | None = None
    reported_at: datetime | None = None


class ParseTaskResultDTO(BaseModel):
    """Validated task parse result from services/ai."""

    model_config = ConfigDict(extra="forbid")

    status: Literal["suggested", "fallback"]
    confidence: float = Field(ge=0.0, le=1.0)
    proposed_fields: TaskProposalDTO
    fallback_reason: FallbackReason | None
    error_code: str | None

    @model_validator(mode="after")
    def validate_fallback_metadata(self) -> Self:
        _validate_fallback_metadata(self.status, self.fallback_reason, self.error_code)
        return self


class ParseInterruptionResultDTO(BaseModel):
    """Validated interruption parse result from services/ai."""

    model_config = ConfigDict(extra="forbid")

    status: Literal["suggested", "fallback"]
    confidence: float = Field(ge=0.0, le=1.0)
    proposed_fields: InterruptionProposalDTO
    fallback_reason: FallbackReason | None
    error_code: str | None

    @model_validator(mode="after")
    def validate_fallback_metadata(self) -> Self:
        _validate_fallback_metadata(self.status, self.fallback_reason, self.error_code)
        return self


class AiClient(Protocol):
    """Explicit port used by authenticated planning routes."""

    def parse_task(self, request: dict[str, object]) -> ParseTaskResultDTO:
        """Return an editable task proposal or deterministic fallback."""

    def parse_interruption(
        self, request: dict[str, object]
    ) -> ParseInterruptionResultDTO:
        """Return an editable interruption proposal or deterministic fallback."""


class DisabledAiClient:
    """Fallback client used when no AI service URL is configured."""

    def parse_task(self, request: dict[str, object]) -> ParseTaskResultDTO:
        return _task_fallback("ai_disabled", "ai_disabled")

    def parse_interruption(
        self, request: dict[str, object]
    ) -> ParseInterruptionResultDTO:
        return _interruption_fallback("ai_disabled", "ai_disabled")


class HttpAiClient:
    """Synchronous HTTP adapter for the internal AI service."""

    def __init__(self, base_url: str, timeout_seconds: float = 2.0) -> None:
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout_seconds

    def parse_task(self, request: dict[str, object]) -> ParseTaskResultDTO:
        return self._post_result(
            "/v1/parse-task",
            request,
            ParseTaskResultDTO,
            _task_fallback,
        )

    def parse_interruption(
        self, request: dict[str, object]
    ) -> ParseInterruptionResultDTO:
        return self._post_result(
            "/v1/parse-interruption",
            request,
            ParseInterruptionResultDTO,
            _interruption_fallback,
        )

    def _post_result(
        self,
        path: str,
        request: dict[str, object],
        result_type: type[ParseTaskResultDTO] | type[ParseInterruptionResultDTO],
        fallback_factory,
    ):
        try:
            response = httpx.post(
                f"{self._base_url}{path}",
                json=request,
                timeout=self._timeout,
            )
        except httpx.TimeoutException:
            return fallback_factory("timeout", "ai_service_timeout")
        except httpx.HTTPError:
            return fallback_factory("service_unavailable", "ai_service_unavailable")

        if response.status_code == 422:
            return fallback_factory("invalid_response", "ai_service_rejected_request")
        if response.status_code >= 400:
            return fallback_factory("service_unavailable", "ai_service_non_success")

        try:
            return result_type.model_validate(response.json())
        except (ValueError, ValidationError):
            return fallback_factory("invalid_response", "ai_service_invalid_response")


def _task_fallback(reason: FallbackReason, error_code: str) -> ParseTaskResultDTO:
    return ParseTaskResultDTO(
        status="fallback",
        confidence=0.0,
        proposed_fields=TaskProposalDTO(),
        fallback_reason=reason,
        error_code=error_code,
    )


def _interruption_fallback(
    reason: FallbackReason, error_code: str
) -> ParseInterruptionResultDTO:
    return ParseInterruptionResultDTO(
        status="fallback",
        confidence=0.0,
        proposed_fields=InterruptionProposalDTO(),
        fallback_reason=reason,
        error_code=error_code,
    )


def _validate_fallback_metadata(
    status: str, fallback_reason: str | None, error_code: str | None
) -> None:
    if status == "suggested":
        if fallback_reason is not None or error_code is not None:
            raise ValueError("suggested results cannot include fallback metadata")
    elif fallback_reason is None:
        raise ValueError("fallback results require fallback_reason")
