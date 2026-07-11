"""Strict parse request and response contracts."""

from __future__ import annotations

from datetime import date, datetime
from enum import StrEnum
from typing import Literal, Self
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictBool,
    StrictFloat,
    StrictInt,
    StrictStr,
    field_validator,
    model_validator,
)


class ParseStatus(StrEnum):
    """Stable parse result states shared with the API."""

    SUGGESTED = "suggested"
    FALLBACK = "fallback"


class FallbackReason(StrEnum):
    """Stable non-success categories shared with the API."""

    AI_DISABLED = "ai_disabled"
    SERVICE_UNAVAILABLE = "service_unavailable"
    TIMEOUT = "timeout"
    PROVIDER_ERROR = "provider_error"
    INVALID_RESPONSE = "invalid_response"
    UNABLE_TO_PARSE = "unable_to_parse"


class HealthResponseDTO(BaseModel):
    """Dependency-free liveness response."""

    status: Literal["ok"] = "ok"


class ValidationErrorResponseDTO(BaseModel):
    """Safe validation error envelope that never echoes request text."""

    code: Literal["validation_error"] = "validation_error"
    details: list[Literal["The AI parse request is invalid."]] = Field(
        default_factory=lambda: ["The AI parse request is invalid."]
    )


class ParseRequestDTO(BaseModel):
    """Base user text parse request."""

    model_config = ConfigDict(extra="forbid")

    text: StrictStr = Field(min_length=1, max_length=2000)
    local_date: date | None = None
    time_zone: StrictStr | None = Field(default=None, min_length=1, max_length=64)

    @field_validator("text")
    @classmethod
    def validate_text(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("text must not be blank")
        return stripped

    @field_validator("time_zone")
    @classmethod
    def validate_time_zone(cls, value: str | None) -> str | None:
        if value is None:
            return value
        stripped = value.strip()
        try:
            ZoneInfo(stripped)
        except ZoneInfoNotFoundError as error:
            raise ValueError("time_zone must be a valid IANA time zone") from error
        return stripped


class ParseTaskRequestDTO(ParseRequestDTO):
    """Parse one informal flexible task description."""


class ParseInterruptionRequestDTO(ParseRequestDTO):
    """Parse one informal unavailable-time description."""


class TaskProposalDTO(BaseModel):
    """Editable task fields proposed by AI parsing."""

    model_config = ConfigDict(extra="forbid")

    title: StrictStr | None = Field(default=None, min_length=1, max_length=200)
    estimated_minutes: StrictInt | None = Field(default=None, gt=0, le=1440)
    priority: StrictInt | None = Field(default=None, ge=1, le=5)
    due_date: date | None = None
    earliest_start_at: datetime | None = None
    splitting_allowed: StrictBool | None = None
    min_segment_minutes: StrictInt | None = Field(default=None, ge=15, le=1440)

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str | None) -> str | None:
        if value is None:
            return value
        stripped = value.strip()
        if not stripped:
            raise ValueError("title must not be blank")
        return stripped

    @field_validator("earliest_start_at")
    @classmethod
    def validate_earliest_start_at(cls, value: datetime | None) -> datetime | None:
        return None if value is None else _aware_datetime(value)

    @model_validator(mode="after")
    def validate_split_settings(self) -> Self:
        if self.splitting_allowed is False and self.min_segment_minutes is not None:
            raise ValueError(
                "min_segment_minutes must be omitted when splitting is not allowed"
            )
        if (
            self.estimated_minutes is not None
            and self.min_segment_minutes is not None
            and self.min_segment_minutes > self.estimated_minutes
        ):
            raise ValueError("min_segment_minutes cannot exceed estimated_minutes")
        return self


class InterruptionProposalDTO(BaseModel):
    """Editable interruption fields proposed by AI parsing."""

    model_config = ConfigDict(extra="forbid")

    start_at: datetime | None = None
    end_at: datetime | None = None
    time_zone: StrictStr | None = Field(default=None, min_length=1, max_length=64)
    reported_at: datetime | None = None

    @field_validator("time_zone")
    @classmethod
    def validate_time_zone(cls, value: str | None) -> str | None:
        if value is None:
            return value
        stripped = value.strip()
        try:
            ZoneInfo(stripped)
        except ZoneInfoNotFoundError as error:
            raise ValueError("time_zone must be a valid IANA time zone") from error
        return stripped

    @field_validator("start_at", "end_at", "reported_at")
    @classmethod
    def validate_datetimes(cls, value: datetime | None) -> datetime | None:
        return None if value is None else _aware_datetime(value)

    @model_validator(mode="after")
    def validate_interval(self) -> Self:
        if self.start_at is not None and self.end_at is not None:
            if self.end_at <= self.start_at:
                raise ValueError("end_at must be after start_at")
        return self


class ParseResultDTO(BaseModel):
    """Shared explicit fallback result contract."""

    model_config = ConfigDict(extra="forbid")

    status: ParseStatus
    confidence: StrictFloat = Field(ge=0.0, le=1.0)
    fallback_reason: FallbackReason | None = None
    error_code: StrictStr | None = Field(default=None, min_length=1, max_length=80)

    @model_validator(mode="after")
    def validate_fallback_metadata(self) -> Self:
        if self.status is ParseStatus.SUGGESTED:
            if self.fallback_reason is not None or self.error_code is not None:
                raise ValueError("suggested results cannot include fallback metadata")
        elif self.fallback_reason is None:
            raise ValueError("fallback results require fallback_reason")
        return self


class ParseTaskResultDTO(ParseResultDTO):
    """Task parse result."""

    proposed_fields: TaskProposalDTO = Field(default_factory=TaskProposalDTO)


class ParseInterruptionResultDTO(ParseResultDTO):
    """Interruption parse result."""

    proposed_fields: InterruptionProposalDTO = Field(
        default_factory=InterruptionProposalDTO
    )


def task_fallback(
    reason: FallbackReason, error_code: str | None = None
) -> ParseTaskResultDTO:
    """Build a safe task fallback without user/provider text."""
    return ParseTaskResultDTO(
        status=ParseStatus.FALLBACK,
        confidence=0.0,
        proposed_fields=TaskProposalDTO(),
        fallback_reason=reason,
        error_code=error_code,
    )


def interruption_fallback(
    reason: FallbackReason, error_code: str | None = None
) -> ParseInterruptionResultDTO:
    """Build a safe interruption fallback without user/provider text."""
    return ParseInterruptionResultDTO(
        status=ParseStatus.FALLBACK,
        confidence=0.0,
        proposed_fields=InterruptionProposalDTO(),
        fallback_reason=reason,
        error_code=error_code,
    )


def _aware_datetime(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("datetime fields must include an explicit UTC offset")
    return value
