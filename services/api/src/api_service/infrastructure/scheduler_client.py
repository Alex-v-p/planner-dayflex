"""HTTP client boundary for the scheduler service contract."""

from __future__ import annotations

from typing import Protocol

import httpx
from pydantic import BaseModel, ConfigDict, Field, StrictStr, ValidationError


class SchedulerUnavailableError(Exception):
    """Raised when the scheduler service cannot return a usable response."""


class SchedulerValidationFailedError(Exception):
    """Raised when the scheduler rejects API-built planning inputs."""


class TimeIntervalDTO(BaseModel):
    """Scheduler interval response shape."""

    model_config = ConfigDict(extra="forbid")

    start: StrictStr
    end: StrictStr


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


class HttpSchedulerClient:
    """Synchronous HTTP adapter for the scheduler service."""

    def __init__(self, base_url: str, timeout_seconds: float = 5.0) -> None:
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout_seconds

    def schedule_day(self, request: dict[str, object]) -> ScheduleResultDTO:
        """Call the scheduler service and validate its response envelope."""
        try:
            response = httpx.post(
                f"{self._base_url}/v1/schedule-day",
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
