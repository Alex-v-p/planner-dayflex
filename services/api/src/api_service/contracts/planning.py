"""HTTP contracts for persisted planning inputs."""

from __future__ import annotations

from datetime import date, datetime, time
from typing import Literal, Self
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictBool,
    StrictInt,
    StrictStr,
    field_validator,
    model_validator,
)


class PlanningRequest(BaseModel):
    """Base request settings for browser-supplied planning inputs."""

    model_config = ConfigDict(extra="forbid")


class UserPreferencesRequest(PlanningRequest):
    """Planning defaults supplied by the browser."""

    time_zone: StrictStr = Field(min_length=1, max_length=64)
    day_start_local: time
    day_end_local: time
    default_buffer_minutes: StrictInt = Field(ge=0)

    @field_validator("time_zone")
    @classmethod
    def validate_time_zone(cls, value: str) -> str:
        return _valid_time_zone(value)

    @field_validator("day_start_local", "day_end_local")
    @classmethod
    def validate_local_time(cls, value: time) -> time:
        if value.tzinfo is not None:
            raise ValueError("day bounds must be local times without offsets")
        return value

    @model_validator(mode="after")
    def validate_day_bounds(self) -> Self:
        if self.day_start_local >= self.day_end_local:
            raise ValueError("day_start_local must be before day_end_local")
        return self


class UserPreferencesResponse(BaseModel):
    """Stored planning defaults."""

    model_config = ConfigDict(from_attributes=True)

    time_zone: str
    day_start_local: time
    day_end_local: time
    default_buffer_minutes: int


class PlanningDayCreateRequest(PlanningRequest):
    """Create one local planning day."""

    local_date: date
    time_zone: StrictStr = Field(min_length=1, max_length=64)

    @field_validator("local_date", mode="before")
    @classmethod
    def validate_local_date(cls, value: object) -> object:
        return _date_only(value, "local_date")

    @field_validator("time_zone")
    @classmethod
    def validate_time_zone(cls, value: str) -> str:
        return _valid_time_zone(value)


class PlanningDayResponse(BaseModel):
    """Stored planning day."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    local_date: date
    time_zone: str
    current_snapshot_id: str | None
    created_at: datetime


class FixedEventCreateRequest(PlanningRequest):
    """Create one fixed event on a planning day."""

    title: StrictStr = Field(min_length=1, max_length=200)
    start_at: datetime
    end_at: datetime
    time_zone: StrictStr = Field(min_length=1, max_length=64)

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        return _non_empty_string(value, "title")

    @field_validator("time_zone")
    @classmethod
    def validate_time_zone(cls, value: str) -> str:
        return _valid_time_zone(value)

    @field_validator("start_at", "end_at")
    @classmethod
    def validate_aware_datetime(cls, value: datetime) -> datetime:
        return _aware_datetime(value)

    @model_validator(mode="after")
    def validate_interval(self) -> Self:
        if self.end_at <= self.start_at:
            raise ValueError("end_at must be after start_at")
        return self


class FixedEventUpdateRequest(PlanningRequest):
    """Replace one fixed event."""

    title: StrictStr = Field(min_length=1, max_length=200)
    start_at: datetime
    end_at: datetime
    time_zone: StrictStr = Field(min_length=1, max_length=64)

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        return _non_empty_string(value, "title")

    @field_validator("time_zone")
    @classmethod
    def validate_time_zone(cls, value: str) -> str:
        return _valid_time_zone(value)

    @field_validator("start_at", "end_at")
    @classmethod
    def validate_aware_datetime(cls, value: datetime) -> datetime:
        return _aware_datetime(value)

    @model_validator(mode="after")
    def validate_interval(self) -> Self:
        if self.end_at <= self.start_at:
            raise ValueError("end_at must be after start_at")
        return self


class FixedEventResponse(BaseModel):
    """Stored fixed event."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    planning_day_id: str
    title: str
    start_at: datetime
    end_at: datetime
    time_zone: str
    created_at: datetime
    updated_at: datetime


class TaskCreateRequest(PlanningRequest):
    """Create one flexible task."""

    title: StrictStr = Field(min_length=1, max_length=200)
    estimated_minutes: StrictInt = Field(gt=0)
    priority: StrictInt = Field(ge=1, le=5)
    due_date: date | None = None
    earliest_start_at: datetime | None = None
    splitting_allowed: StrictBool = False
    min_segment_minutes: StrictInt | None = None

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        return _non_empty_string(value, "title")

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
        _validate_split_settings(
            self.splitting_allowed,
            self.min_segment_minutes,
            self.estimated_minutes,
        )
        return self


class TaskUpdateRequest(PlanningRequest):
    """Replace editable flexible task settings."""

    title: StrictStr = Field(min_length=1, max_length=200)
    estimated_minutes: StrictInt = Field(gt=0)
    priority: StrictInt = Field(ge=1, le=5)
    due_date: date | None = None
    earliest_start_at: datetime | None = None
    splitting_allowed: StrictBool = False
    min_segment_minutes: StrictInt | None = None

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        return _non_empty_string(value, "title")

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
        _validate_split_settings(
            self.splitting_allowed,
            self.min_segment_minutes,
            self.estimated_minutes,
        )
        return self


class TaskResponse(BaseModel):
    """Stored flexible task."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    estimated_minutes: int
    priority: int
    due_date: date | None
    earliest_start_at: datetime | None
    splitting_allowed: bool
    min_segment_minutes: int | None
    status: str
    completed_minutes: int
    remaining_minutes: int
    created_at: datetime
    updated_at: datetime


class TaskProgressCreateRequest(PlanningRequest):
    """Record immutable completed work for a task on one planning day."""

    task_id: StrictStr = Field(min_length=1, max_length=36)
    completed_minutes: StrictInt = Field(gt=0)
    recorded_at: datetime

    @field_validator("recorded_at")
    @classmethod
    def validate_recorded_at(cls, value: datetime) -> datetime:
        return _aware_datetime(value)


class TaskProgressResponse(BaseModel):
    """Stored task progress record."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    task_id: str
    planning_day_id: str
    completed_minutes: int
    recorded_at: datetime
    created_at: datetime


class InterruptionCreateRequest(PlanningRequest):
    """Report an unavailable interval on one planning day."""

    start_at: datetime
    end_at: datetime
    time_zone: StrictStr = Field(min_length=1, max_length=64)
    reported_at: datetime

    @field_validator("time_zone")
    @classmethod
    def validate_time_zone(cls, value: str) -> str:
        return _valid_time_zone(value)

    @field_validator("start_at", "end_at", "reported_at")
    @classmethod
    def validate_aware_datetime(cls, value: datetime) -> datetime:
        return _aware_datetime(value)

    @model_validator(mode="after")
    def validate_interval(self) -> Self:
        if self.end_at <= self.start_at:
            raise ValueError("end_at must be after start_at")
        return self


class ScheduleItemResponse(BaseModel):
    """One browser-facing block in a persisted schedule snapshot."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    kind: str
    task_id: str | None
    fixed_event_id: str | None
    interruption_id: str | None
    start_at: datetime
    end_at: datetime


class ScheduleDecisionResponse(BaseModel):
    """A stable structured decision or warning from a persisted snapshot."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    task_id: str | None
    reason_code: str
    details: dict[str, str]


class ScheduleSnapshotResponse(BaseModel):
    """A complete immutable daily schedule snapshot."""

    id: str
    planning_day_id: str
    version: int
    created_at: datetime
    scheduler_version: str
    configuration: dict[str, object]
    items: list[ScheduleItemResponse]
    decisions: list[ScheduleDecisionResponse]


class ScheduleSnapshotSummaryResponse(BaseModel):
    """Small historical snapshot listing shape."""

    id: str
    planning_day_id: str
    version: int
    created_at: datetime
    scheduler_version: str


class PlanningDaySummaryResponse(BaseModel):
    """One day in a week or month planning overview."""

    local_date: date
    planning_day_id: str | None
    time_zone: str | None
    status: str
    snapshot_id: str | None
    snapshot_version: int | None
    planned_minutes: int
    fixed_event_count: int
    interruption_minutes: int
    unscheduled_deferred_count: int
    has_useful_free_time: bool


class PlanningRangeSummaryResponse(BaseModel):
    """Browser-facing saved-plan summary for a contiguous local date range."""

    start_date: date
    end_date: date
    days: list[PlanningDaySummaryResponse]


class FreeTimeWindowResponse(BaseModel):
    """One persisted designated free-time window from a current snapshot."""

    local_date: date
    planning_day_id: str
    time_zone: str
    snapshot_id: str
    snapshot_version: int
    snapshot_created_at: datetime
    schedule_item_id: str
    start_at: datetime
    end_at: datetime
    duration_minutes: int


class FreeTimeDayResponse(BaseModel):
    """Free-time finder result for one requested local date."""

    local_date: date
    planning_day_id: str | None
    time_zone: str | None
    status: Literal["no_generated_plan", "no_useful_free_time", "has_free_time"]
    snapshot_id: str | None
    snapshot_version: int | None
    snapshot_created_at: datetime | None
    windows: list[FreeTimeWindowResponse]


class FreeTimeRangeResponse(BaseModel):
    """Browser-facing free-time finder response for a date range."""

    start_date: date
    end_date: date
    minimum_minutes: int
    days: list[FreeTimeDayResponse]


def _valid_time_zone(value: str) -> str:
    stripped = value.strip()
    try:
        ZoneInfo(stripped)
    except ZoneInfoNotFoundError as error:
        raise ValueError("time_zone must be a valid IANA time zone") from error
    return stripped


def _non_empty_string(value: str, field_name: str) -> str:
    stripped = value.strip()
    if not stripped:
        raise ValueError(f"{field_name} must not be blank")
    return stripped


def _aware_datetime(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("datetime fields must include an explicit UTC offset")
    return value


def _date_only(value: object, field_name: str) -> object:
    if value is None:
        return value
    if isinstance(value, datetime):
        raise ValueError(f"{field_name} must be a date without a time")
    if isinstance(value, str) and "T" in value:
        raise ValueError(f"{field_name} must be a date without a time")
    return value


def _validate_split_settings(
    splitting_allowed: bool,
    min_segment_minutes: int | None,
    estimated_minutes: int,
) -> None:
    if splitting_allowed:
        if min_segment_minutes is None:
            raise ValueError(
                "min_segment_minutes is required when splitting is allowed"
            )
        if min_segment_minutes < 15:
            raise ValueError("min_segment_minutes must be at least 15")
        if min_segment_minutes > estimated_minutes:
            raise ValueError("min_segment_minutes cannot exceed estimated_minutes")
        return
    if min_segment_minutes is not None:
        raise ValueError(
            "min_segment_minutes must be omitted when splitting is not allowed"
        )
