"""HTTP client boundary for optional AI parsing."""

from __future__ import annotations

from datetime import date, datetime
import re
from typing import Literal, Protocol, Self
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictBool,
    StrictFloat,
    StrictInt,
    StrictStr,
    ValidationError,
    field_validator,
    model_validator,
)

from api_service.correlation import REQUEST_ID_HEADER, current_request_id


FallbackReason = Literal[
    "ai_disabled",
    "service_unavailable",
    "timeout",
    "provider_error",
    "invalid_response",
    "unable_to_parse",
]
ScheduleReasonCode = Literal[
    "placed_in_earliest_valid_window",
    "moved_after_interruption",
    "split_across_available_windows",
    "blocked_by_fixed_event",
    "blocked_by_interruption",
    "missed_before_current_time",
    "insufficient_time_before_deadline",
    "insufficient_remaining_day_time",
    "designated_free_time",
    "locked_time_overlap_merged",
]
DATE_ONLY_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class TaskProposalDTO(BaseModel):
    """AI service task proposal shape."""

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

    @field_validator("due_date", mode="before")
    @classmethod
    def validate_due_date(cls, value: object) -> object:
        return _date_only(value, "due_date")

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
    """AI service interruption proposal shape."""

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


class ParseTaskResultDTO(BaseModel):
    """Validated task parse result from services/ai."""

    model_config = ConfigDict(extra="forbid")

    status: Literal["suggested", "fallback"]
    confidence: StrictFloat = Field(ge=0.0, le=1.0)
    proposed_fields: TaskProposalDTO
    fallback_reason: FallbackReason | None
    error_code: StrictStr | None = Field(default=None, min_length=1, max_length=80)

    @model_validator(mode="after")
    def validate_fallback_metadata(self) -> Self:
        _validate_fallback_metadata(self.status, self.fallback_reason, self.error_code)
        return self


class ParseInterruptionResultDTO(BaseModel):
    """Validated interruption parse result from services/ai."""

    model_config = ConfigDict(extra="forbid")

    status: Literal["suggested", "fallback"]
    confidence: StrictFloat = Field(ge=0.0, le=1.0)
    proposed_fields: InterruptionProposalDTO
    fallback_reason: FallbackReason | None
    error_code: StrictStr | None = Field(default=None, min_length=1, max_length=80)

    @model_validator(mode="after")
    def validate_fallback_metadata(self) -> Self:
        _validate_fallback_metadata(self.status, self.fallback_reason, self.error_code)
        return self


class ScheduleDecisionFactsDTO(BaseModel):
    """Approved schedule facts sent to services/ai."""

    model_config = ConfigDict(extra="forbid")

    task_title: StrictStr | None = Field(default=None, min_length=1, max_length=200)
    task_estimated_minutes: StrictInt | None = Field(default=None, gt=0, le=1440)
    task_priority: StrictInt | None = Field(default=None, ge=1, le=5)
    task_due_date: StrictStr | None = Field(default=None, min_length=10, max_length=10)
    scheduled_start_at: datetime | None = None
    scheduled_end_at: datetime | None = None
    previous_start_at: datetime | None = None
    previous_end_at: datetime | None = None
    interruption_start_at: datetime | None = None
    interruption_end_at: datetime | None = None
    day_start_at: datetime | None = None
    day_end_at: datetime | None = None
    free_window_minutes: StrictInt | None = Field(default=None, ge=1, le=1440)
    reason_details: dict[StrictStr, StrictStr] = Field(default_factory=dict)

    @field_validator(
        "scheduled_start_at",
        "scheduled_end_at",
        "previous_start_at",
        "previous_end_at",
        "interruption_start_at",
        "interruption_end_at",
        "day_start_at",
        "day_end_at",
    )
    @classmethod
    def validate_datetimes(cls, value: datetime | None) -> datetime | None:
        return None if value is None else _aware_datetime(value)

    @field_validator("task_title")
    @classmethod
    def validate_task_title(cls, value: str | None) -> str | None:
        if value is None:
            return value
        stripped = value.strip()
        if not stripped:
            raise ValueError("task_title must not be blank")
        return stripped


class ExplainScheduleDecisionRequestDTO(BaseModel):
    """Validated request shape for services/ai explanations."""

    model_config = ConfigDict(extra="forbid")

    reason_code: ScheduleReasonCode
    deterministic_reason: StrictStr = Field(min_length=1, max_length=500)
    facts: ScheduleDecisionFactsDTO


class ExplainScheduleDecisionResultDTO(BaseModel):
    """Validated schedule explanation result from services/ai."""

    model_config = ConfigDict(extra="forbid")

    status: Literal["explained", "fallback"]
    confidence: StrictFloat = Field(ge=0.0, le=1.0)
    explanation: StrictStr | None = Field(default=None, min_length=1, max_length=700)
    fallback_reason: FallbackReason | None
    error_code: StrictStr | None = Field(default=None, min_length=1, max_length=80)

    @model_validator(mode="after")
    def validate_fallback_metadata(self) -> Self:
        if self.status == "explained":
            if self.explanation is None:
                raise ValueError("explained results require explanation")
            if self.fallback_reason is not None or self.error_code is not None:
                raise ValueError("explained results cannot include fallback metadata")
        elif self.fallback_reason is None:
            raise ValueError("fallback results require fallback_reason")
        return self


class AiClient(Protocol):
    """Explicit port used by authenticated planning routes."""

    def parse_task(self, request: dict[str, object]) -> ParseTaskResultDTO:
        """Return an editable task proposal or deterministic fallback."""

    def parse_interruption(
        self, request: dict[str, object]
    ) -> ParseInterruptionResultDTO:
        """Return an editable interruption proposal or deterministic fallback."""

    def explain_schedule_decision(
        self, request: dict[str, object]
    ) -> ExplainScheduleDecisionResultDTO:
        """Return optional schedule wording or deterministic fallback."""


class DisabledAiClient:
    """Fallback client used when no AI service URL is configured."""

    def parse_task(self, request: dict[str, object]) -> ParseTaskResultDTO:
        return _task_fallback("ai_disabled", "ai_disabled")

    def parse_interruption(
        self, request: dict[str, object]
    ) -> ParseInterruptionResultDTO:
        return _interruption_fallback("ai_disabled", "ai_disabled")

    def explain_schedule_decision(
        self, request: dict[str, object]
    ) -> ExplainScheduleDecisionResultDTO:
        return _explanation_fallback("ai_disabled", "ai_disabled")


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

    def explain_schedule_decision(
        self, request: dict[str, object]
    ) -> ExplainScheduleDecisionResultDTO:
        return self._post_result(
            "/v1/explain-schedule-decision",
            request,
            ExplainScheduleDecisionResultDTO,
            _explanation_fallback,
        )

    def _post_result(
        self,
        path: str,
        request: dict[str, object],
        result_type: (
            type[ParseTaskResultDTO]
            | type[ParseInterruptionResultDTO]
            | type[ExplainScheduleDecisionResultDTO]
        ),
        fallback_factory,
    ):
        try:
            response = httpx.post(
                f"{self._base_url}{path}",
                json=request,
                headers=_correlation_headers(),
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


def _explanation_fallback(
    reason: FallbackReason, error_code: str
) -> ExplainScheduleDecisionResultDTO:
    return ExplainScheduleDecisionResultDTO(
        status="fallback",
        confidence=0.0,
        explanation=None,
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


def _aware_datetime(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("datetime fields must include an explicit UTC offset")
    return value


def _date_only(value: object, field_name: str) -> object:
    if value is None:
        return value
    if isinstance(value, datetime) or not isinstance(value, (date, str)):
        raise ValueError(f"{field_name} must be a date without a time")
    if isinstance(value, str) and DATE_ONLY_PATTERN.fullmatch(value) is None:
        raise ValueError(f"{field_name} must be a date without a time")
    return value


def _correlation_headers() -> dict[str, str]:
    request_id = current_request_id()
    if request_id is None:
        return {}
    return {REQUEST_ID_HEADER: request_id}
