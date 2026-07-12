"""Strict schedule explanation request and response contracts."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Self

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictFloat,
    StrictInt,
    StrictStr,
    field_validator,
    model_validator,
)

from ai_service.contracts.parsing import FallbackReason


class ExplanationStatus(StrEnum):
    """Stable explanation result states shared with the API."""

    EXPLAINED = "explained"
    FALLBACK = "fallback"


class ScheduleReasonCode(StrEnum):
    """Scheduler reason codes that may be explained by AI."""

    PLACED_IN_EARLIEST_VALID_WINDOW = "placed_in_earliest_valid_window"
    MOVED_AFTER_INTERRUPTION = "moved_after_interruption"
    SPLIT_ACROSS_AVAILABLE_WINDOWS = "split_across_available_windows"
    BLOCKED_BY_FIXED_EVENT = "blocked_by_fixed_event"
    BLOCKED_BY_INTERRUPTION = "blocked_by_interruption"
    MISSED_BEFORE_CURRENT_TIME = "missed_before_current_time"
    INSUFFICIENT_TIME_BEFORE_DEADLINE = "insufficient_time_before_deadline"
    INSUFFICIENT_REMAINING_DAY_TIME = "insufficient_remaining_day_time"
    DESIGNATED_FREE_TIME = "designated_free_time"
    LOCKED_TIME_OVERLAP_MERGED = "locked_time_overlap_merged"


class ScheduleDecisionFactsDTO(BaseModel):
    """Approved structured facts available for explanation wording."""

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
        if value is None:
            return value
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("datetime fields must include an explicit UTC offset")
        return value

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
    """AI-service request for optional wording of an existing decision."""

    model_config = ConfigDict(extra="forbid")

    reason_code: ScheduleReasonCode
    deterministic_reason: StrictStr = Field(min_length=1, max_length=500)
    facts: ScheduleDecisionFactsDTO

    @field_validator("deterministic_reason")
    @classmethod
    def validate_reason(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("deterministic_reason must not be blank")
        return stripped


class ExplainScheduleDecisionResultDTO(BaseModel):
    """Grounded optional wording with explicit fallback metadata."""

    model_config = ConfigDict(extra="forbid")

    status: ExplanationStatus
    confidence: StrictFloat = Field(ge=0.0, le=1.0)
    explanation: StrictStr | None = Field(default=None, min_length=1, max_length=700)
    fallback_reason: FallbackReason | None = None
    error_code: StrictStr | None = Field(default=None, min_length=1, max_length=80)

    @model_validator(mode="after")
    def validate_status_metadata(self) -> Self:
        if self.status is ExplanationStatus.EXPLAINED:
            if self.explanation is None:
                raise ValueError("explained results require explanation")
            if self.fallback_reason is not None or self.error_code is not None:
                raise ValueError("explained results cannot include fallback metadata")
        elif self.fallback_reason is None:
            raise ValueError("fallback results require fallback_reason")
        return self


def explanation_fallback(
    reason: FallbackReason, error_code: str | None = None
) -> ExplainScheduleDecisionResultDTO:
    """Build a safe explanation fallback without schedule/provider payloads."""
    return ExplainScheduleDecisionResultDTO(
        status=ExplanationStatus.FALLBACK,
        confidence=0.0,
        explanation=None,
        fallback_reason=reason,
        error_code=error_code,
    )
