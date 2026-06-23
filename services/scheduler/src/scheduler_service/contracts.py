"""Pydantic HTTP contracts and explicit mappings to scheduler-core values."""

from __future__ import annotations

import re
from datetime import date, datetime, time
from typing import Annotated, Self

from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    StrictBool,
    StrictInt,
    StrictStr,
    field_validator,
)
from scheduler_core import (
    DecisionReasonCode,
    FixedEvent,
    FlexibleTask,
    Interruption,
    PlanningDay,
    ScheduleDecision,
    ScheduleItem,
    ScheduleItemKind,
    ScheduleRequest,
    ScheduleResult,
    ScheduleWarning,
    SchedulerConfiguration,
    TaskProgress,
    TimeInterval,
    WarningCode,
)


_ISO_OFFSET_SUFFIX = re.compile(r"(?:Z|[+-]\d{2}:\d{2})$")


def _require_iso_datetime_offset(value: object) -> object:
    """Accept only ISO datetime strings that explicitly identify their offset."""
    if isinstance(value, datetime):
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("must be a timezone-aware datetime")
        return value
    if not isinstance(value, str) or not _ISO_OFFSET_SUFFIX.search(value):
        raise ValueError("must be an ISO datetime with an explicit UTC offset")
    return value


OffsetDateTime = Annotated[datetime, BeforeValidator(_require_iso_datetime_offset)]


class ContractModel(BaseModel):
    """Base configuration for the public scheduler contract models."""

    model_config = ConfigDict(extra="forbid")


class TimeIntervalDTO(ContractModel):
    """A timezone-aware, half-open interval represented on the wire."""

    start: OffsetDateTime
    end: OffsetDateTime

    def to_core(self) -> TimeInterval:
        """Map this transport interval into the framework-free core contract."""
        return TimeInterval(start=self.start, end=self.end)

    @classmethod
    def from_core(cls, interval: TimeInterval) -> Self:
        """Map a core interval into the public transport contract."""
        return cls(start=interval.start, end=interval.end)


class PlanningDayDTO(ContractModel):
    """One local planning date and its IANA time zone."""

    local_date: date
    time_zone: StrictStr

    def to_core(self) -> PlanningDay:
        """Map this transport planning day into the core contract."""
        return PlanningDay(local_date=self.local_date, time_zone=self.time_zone)


class FixedEventDTO(ContractModel):
    """A non-movable commitment that reserves time."""

    id: StrictStr
    title: StrictStr
    interval: TimeIntervalDTO

    def to_core(self) -> FixedEvent:
        """Map this transport fixed event into the core contract."""
        return FixedEvent(
            id=self.id, title=self.title, interval=self.interval.to_core()
        )


class InterruptionDTO(ContractModel):
    """A reported unavailable block that reserves time."""

    id: StrictStr
    interval: TimeIntervalDTO

    def to_core(self) -> Interruption:
        """Map this transport interruption into the core contract."""
        return Interruption(id=self.id, interval=self.interval.to_core())


class FlexibleTaskDTO(ContractModel):
    """Flexible work that the core may place or split."""

    id: StrictStr
    title: StrictStr
    estimated_minutes: StrictInt
    priority: StrictInt
    created_at: OffsetDateTime
    due_date: date | None = None
    earliest_start_at: OffsetDateTime | None = None
    splitting_allowed: StrictBool = False

    def to_core(self) -> FlexibleTask:
        """Map this transport task into the core contract."""
        return FlexibleTask(
            id=self.id,
            title=self.title,
            estimated_minutes=self.estimated_minutes,
            priority=self.priority,
            created_at=self.created_at,
            due_date=self.due_date,
            earliest_start_at=self.earliest_start_at,
            splitting_allowed=self.splitting_allowed,
        )


class TaskProgressDTO(ContractModel):
    """An immutable completed-work record used during rescheduling."""

    task_id: StrictStr
    completed_minutes: StrictInt
    recorded_at: OffsetDateTime

    def to_core(self) -> TaskProgress:
        """Map this transport progress entry into the core contract."""
        return TaskProgress(
            task_id=self.task_id,
            completed_minutes=self.completed_minutes,
            recorded_at=self.recorded_at,
        )


class SchedulerConfigurationDTO(ContractModel):
    """Explicit deterministic scheduling configuration for one request."""

    day_start: time = time(8, 0)
    day_end: time = time(18, 0)
    buffer_minutes: StrictInt = 10
    minimum_free_time_minutes: StrictInt = 30
    minimum_segment_minutes: StrictInt = 15
    maximum_task_segments: StrictInt = 3

    @field_validator("day_start", "day_end")
    @classmethod
    def require_naive_local_time(cls, value: time) -> time:
        """Keep bounds as local wall-clock times, as required by the core."""
        if value.tzinfo is not None:
            raise ValueError("must be a timezone-naive local time")
        return value

    def to_core(self) -> SchedulerConfiguration:
        """Map this transport configuration into the core contract."""
        return SchedulerConfiguration(
            day_start=self.day_start,
            day_end=self.day_end,
            buffer_minutes=self.buffer_minutes,
            minimum_free_time_minutes=self.minimum_free_time_minutes,
            minimum_segment_minutes=self.minimum_segment_minutes,
            maximum_task_segments=self.maximum_task_segments,
        )


class ScheduleRequestDTO(ContractModel):
    """Complete input for one deterministic daily scheduling calculation."""

    planning_day: PlanningDayDTO
    current_at: OffsetDateTime
    fixed_events: tuple[FixedEventDTO, ...]
    interruptions: tuple[InterruptionDTO, ...]
    tasks: tuple[FlexibleTaskDTO, ...]
    task_progress: tuple[TaskProgressDTO, ...] = ()
    configuration: SchedulerConfigurationDTO = Field(
        default_factory=SchedulerConfigurationDTO
    )

    def to_core(self) -> ScheduleRequest:
        """Map the full HTTP request into its framework-free core equivalent."""
        return ScheduleRequest(
            planning_day=self.planning_day.to_core(),
            current_at=self.current_at,
            fixed_events=tuple(event.to_core() for event in self.fixed_events),
            interruptions=tuple(item.to_core() for item in self.interruptions),
            tasks=tuple(task.to_core() for task in self.tasks),
            task_progress=tuple(item.to_core() for item in self.task_progress),
            configuration=self.configuration.to_core(),
        )


class ScheduleItemDTO(ContractModel):
    """One timeline block returned by a scheduling calculation."""

    kind: ScheduleItemKind
    interval: TimeIntervalDTO
    task_id: StrictStr | None = None

    @classmethod
    def from_core(cls, item: ScheduleItem) -> Self:
        """Map a core result item into the public transport contract."""
        return cls(
            kind=item.kind,
            interval=TimeIntervalDTO.from_core(item.interval),
            task_id=item.task_id,
        )


class ScheduleDecisionDTO(ContractModel):
    """A stable machine-readable placement, deferral, or free-time fact."""

    reason_code: DecisionReasonCode
    task_id: StrictStr | None = None
    details: dict[StrictStr, StrictStr] = Field(default_factory=dict)

    @classmethod
    def from_core(cls, decision: ScheduleDecision) -> Self:
        """Map a core structured decision without changing its reason-code value."""
        return cls(
            reason_code=decision.reason_code,
            task_id=decision.task_id,
            details=dict(decision.details),
        )


class ScheduleWarningDTO(ContractModel):
    """A safe, stable warning for valid but notable scheduling input."""

    code: WarningCode
    details: dict[StrictStr, StrictStr] = Field(default_factory=dict)

    @classmethod
    def from_core(cls, warning: ScheduleWarning) -> Self:
        """Map a core warning without changing its code value."""
        return cls(code=warning.code, details=dict(warning.details))


class ScheduleResultDTO(ContractModel):
    """Complete, chronological output from the deterministic scheduler core."""

    items: tuple[ScheduleItemDTO, ...]
    decisions: tuple[ScheduleDecisionDTO, ...]
    warnings: tuple[ScheduleWarningDTO, ...] = ()

    @classmethod
    def from_core(cls, result: ScheduleResult) -> Self:
        """Map all core result values into explicit HTTP response DTOs."""
        return cls(
            items=tuple(ScheduleItemDTO.from_core(item) for item in result.items),
            decisions=tuple(
                ScheduleDecisionDTO.from_core(decision) for decision in result.decisions
            ),
            warnings=tuple(
                ScheduleWarningDTO.from_core(warning) for warning in result.warnings
            ),
        )


class RescheduleRequestDTO(ContractModel):
    """A prior scheduler result paired with its updated schedule request."""

    previous_result: ScheduleResultDTO
    schedule_request: ScheduleRequestDTO

    def previous_result_to_core(self) -> ScheduleResult:
        """Map the historical HTTP result back into the core result contract."""
        return ScheduleResult(
            items=tuple(
                ScheduleItem(
                    kind=item.kind,
                    interval=item.interval.to_core(),
                    task_id=item.task_id,
                )
                for item in self.previous_result.items
            ),
            decisions=tuple(
                ScheduleDecision(
                    reason_code=decision.reason_code,
                    task_id=decision.task_id,
                    details=decision.details,
                )
                for decision in self.previous_result.decisions
            ),
            warnings=tuple(
                ScheduleWarning(code=warning.code, details=warning.details)
                for warning in self.previous_result.warnings
            ),
        )


class HealthResponseDTO(ContractModel):
    """Liveness response for the scheduler transport process."""

    status: str = "ok"


class ValidationErrorResponseDTO(ContractModel):
    """Safe 422 response envelope that never includes request payloads or traces."""

    code: str = "validation_error"
    details: tuple[str, ...] = ("The scheduler request is invalid.",)
