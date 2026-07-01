"""HTTP contracts for persisted planning inputs."""

from __future__ import annotations

from datetime import date, datetime, time
from typing import Self
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
    created_at: datetime
    updated_at: datetime


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
