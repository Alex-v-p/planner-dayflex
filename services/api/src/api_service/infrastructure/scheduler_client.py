"""HTTP client boundary for the scheduler service contract."""

from __future__ import annotations

from datetime import datetime
from typing import Protocol

import httpx
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictStr,
    ValidationError,
    model_validator,
)


class SchedulerUnavailableError(Exception):
    """Raised when the scheduler service cannot return a usable response."""


class SchedulerValidationFailedError(Exception):
    """Raised when the scheduler rejects API-built planning inputs."""


class TimeIntervalDTO(BaseModel):
    """Scheduler interval response shape."""

    model_config = ConfigDict(extra="forbid")

    start: StrictStr
    end: StrictStr

    @model_validator(mode="after")
    def validate_interval(self) -> TimeIntervalDTO:
        """Require scheduler intervals to be parseable, offset-aware, and ordered."""
        start = _parse_offset_datetime(self.start)
        end = _parse_offset_datetime(self.end)
        if end <= start:
            raise ValueError("scheduler interval end must be after start")
        return self


class ScheduleItemDTO(BaseModel):
    """Scheduler item response shape."""

    model_config = ConfigDict(extra="forbid")

    kind: StrictStr
    interval: TimeIntervalDTO
    task_id: StrictStr | None = None


class ScheduleDecisionDTO(BaseModel):
    """Scheduler decision response shape."""

    model_config = ConfigDict(extra="forbid")

    reason_code: StrictStr
    task_id: StrictStr | None = None
    details: dict[StrictStr, StrictStr] = Field(default_factory=dict)


class ScheduleWarningDTO(BaseModel):
    """Scheduler warning response shape."""

    model_config = ConfigDict(extra="forbid")

    code: StrictStr
    details: dict[StrictStr, StrictStr] = Field(default_factory=dict)


class ScheduleResultDTO(BaseModel):
    """Complete scheduler result response shape."""

    model_config = ConfigDict(extra="forbid")

    items: tuple[ScheduleItemDTO, ...]
    decisions: tuple[ScheduleDecisionDTO, ...]
    warnings: tuple[ScheduleWarningDTO, ...] = ()


class SchedulerClient(Protocol):
    """Explicit port used by the API application service."""

    def schedule_day(self, request: dict[str, object]) -> ScheduleResultDTO:
        """Return one deterministic scheduler result for API-owned inputs."""

    def reschedule_day(
        self,
        previous_result: dict[str, object],
        schedule_request: dict[str, object],
    ) -> ScheduleResultDTO:
        """Return a revised deterministic scheduler result."""


class HttpSchedulerClient:
    """Synchronous HTTP adapter for the scheduler service."""

    def __init__(self, base_url: str, timeout_seconds: float = 5.0) -> None:
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout_seconds

    def schedule_day(self, request: dict[str, object]) -> ScheduleResultDTO:
        """Call the scheduler service and validate its response envelope."""
        return self._post_result("/v1/schedule-day", request)

    def reschedule_day(
        self,
        previous_result: dict[str, object],
        schedule_request: dict[str, object],
    ) -> ScheduleResultDTO:
        """Call the scheduler service to revise a day from a prior result."""
        return self._post_result(
            "/v1/reschedule-day",
            {
                "previous_result": previous_result,
                "schedule_request": schedule_request,
            },
        )

    def _post_result(self, path: str, request: dict[str, object]) -> ScheduleResultDTO:
        """Post a scheduler request and validate the response envelope."""
        try:
            response = httpx.post(
                f"{self._base_url}{path}",
                json=request,
                timeout=self._timeout,
            )
        except httpx.HTTPError as error:
            raise SchedulerUnavailableError from error

        if response.status_code == 422:
            raise SchedulerValidationFailedError
        if response.status_code >= 400:
            raise SchedulerUnavailableError

        try:
            return ScheduleResultDTO.model_validate(response.json())
        except (ValueError, ValidationError) as error:
            raise SchedulerUnavailableError from error


def _parse_offset_datetime(value: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError as error:
        raise ValueError("scheduler interval must be ISO datetime") from error
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError("scheduler interval must include an explicit UTC offset")
    return parsed
