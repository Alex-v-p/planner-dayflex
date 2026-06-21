"""Framework-free contracts and validation for daily scheduling."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, time, timezone
from enum import Enum
from typing import Mapping
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


class SchedulerValidationError(ValueError):
    """Raised when a scheduler request violates a documented domain rule."""


class DecisionReasonCode(str, Enum):
    """Stable machine-readable explanations returned by the scheduler."""

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


class WarningCode(str, Enum):
    """Stable machine-readable warnings for valid but notable inputs."""

    LOCKED_TIME_OVERLAP_MERGED = "locked_time_overlap_merged"


class ScheduleItemKind(str, Enum):
    """Kinds of blocks included in a scheduling result."""

    TASK = "task"
    FIXED_EVENT = "fixed_event"
    INTERRUPTION = "interruption"
    BUFFER = "buffer"
    DESIGNATED_FREE_TIME = "designated_free_time"


def _require_non_empty_string(value: str, field_name: str) -> None:
    if not isinstance(value, str) or not value.strip():
        raise SchedulerValidationError(f"{field_name} must be a non-empty string")


def _require_aware_datetime(value: datetime, field_name: str) -> None:
    if (
        not isinstance(value, datetime)
        or value.tzinfo is None
        or value.utcoffset() is None
    ):
        raise SchedulerValidationError(
            f"{field_name} must be a timezone-aware datetime"
        )


def _require_integer(value: int, field_name: str, minimum: int) -> None:
    if not isinstance(value, int) or isinstance(value, bool) or value < minimum:
        raise SchedulerValidationError(
            f"{field_name} must be an integer of at least {minimum}"
        )


def _zone_for(time_zone: str) -> ZoneInfo:
    _require_non_empty_string(time_zone, "time_zone")
    try:
        return ZoneInfo(time_zone)
    except ZoneInfoNotFoundError as error:
        raise SchedulerValidationError(
            f"time_zone is not a valid IANA zone: {time_zone}"
        ) from error


def local_datetime(
    local_date: date,
    local_time: time,
    time_zone: str,
    *,
    fold: int | None = None,
) -> datetime:
    """Create a valid timezone-aware instant from a local wall-clock time.

    Local times in a daylight-saving gap are rejected. A repeated wall-clock
    time must supply ``fold`` explicitly so the caller chooses its offset.
    """
    if not isinstance(local_date, date) or isinstance(local_date, datetime):
        raise SchedulerValidationError("local_date must be a date")
    if not isinstance(local_time, time) or local_time.tzinfo is not None:
        raise SchedulerValidationError("local_time must be a timezone-naive time")
    if fold not in (None, 0, 1):
        raise SchedulerValidationError("fold must be 0 or 1 when provided")

    zone = _zone_for(time_zone)
    candidates = [
        datetime.combine(local_date, local_time, zone).replace(fold=candidate_fold)
        for candidate_fold in (0, 1)
    ]
    valid_candidates = [
        candidate
        for candidate in candidates
        if candidate.astimezone(timezone.utc).astimezone(zone).replace(tzinfo=None)
        == datetime.combine(local_date, local_time)
    ]

    if not valid_candidates:
        raise SchedulerValidationError(
            "local time does not exist in the planning time zone"
        )
    if (
        len(valid_candidates) == 2
        and valid_candidates[0].utcoffset() != valid_candidates[1].utcoffset()
    ):
        if fold is None:
            raise SchedulerValidationError(
                "local time is ambiguous; an explicit fold is required"
            )
        return valid_candidates[fold]
    return valid_candidates[0]


@dataclass(frozen=True, slots=True)
class TimeInterval:
    """A timezone-aware, half-open interval ``[start, end)``."""

    start: datetime
    end: datetime

    def __post_init__(self) -> None:
        _require_aware_datetime(self.start, "start")
        _require_aware_datetime(self.end, "end")
        if self.end.astimezone(timezone.utc) <= self.start.astimezone(timezone.utc):
            raise SchedulerValidationError("interval end must be after start")

    def overlaps(self, other: TimeInterval) -> bool:
        """Return whether two half-open intervals share any time."""
        return self.start.astimezone(timezone.utc) < other.end.astimezone(
            timezone.utc
        ) and other.start.astimezone(timezone.utc) < self.end.astimezone(timezone.utc)


@dataclass(frozen=True, slots=True)
class PlanningDay:
    """The local date and IANA zone that define one scheduling request."""

    local_date: date
    time_zone: str

    def __post_init__(self) -> None:
        if not isinstance(self.local_date, date) or isinstance(
            self.local_date, datetime
        ):
            raise SchedulerValidationError("local_date must be a date")
        _zone_for(self.time_zone)


@dataclass(frozen=True, slots=True)
class FixedEvent:
    """A non-movable commitment that reserves time."""

    id: str
    title: str
    interval: TimeInterval

    def __post_init__(self) -> None:
        _require_non_empty_string(self.id, "fixed event id")
        _require_non_empty_string(self.title, "fixed event title")
        if not isinstance(self.interval, TimeInterval):
            raise SchedulerValidationError(
                "fixed event interval must be a TimeInterval"
            )


@dataclass(frozen=True, slots=True)
class Interruption:
    """A reported unavailable block that reserves time."""

    id: str
    interval: TimeInterval

    def __post_init__(self) -> None:
        _require_non_empty_string(self.id, "interruption id")
        if not isinstance(self.interval, TimeInterval):
            raise SchedulerValidationError(
                "interruption interval must be a TimeInterval"
            )


@dataclass(frozen=True, slots=True)
class FlexibleTask:
    """Work that the later scheduling algorithm may place or split."""

    id: str
    title: str
    estimated_minutes: int
    priority: int
    created_at: datetime
    due_date: date | None = None
    earliest_start_at: datetime | None = None
    splitting_allowed: bool = False

    def __post_init__(self) -> None:
        _require_non_empty_string(self.id, "task id")
        _require_non_empty_string(self.title, "task title")
        _require_integer(self.estimated_minutes, "estimated_minutes", 1)
        if (
            not isinstance(self.priority, int)
            or isinstance(self.priority, bool)
            or not 1 <= self.priority <= 5
        ):
            raise SchedulerValidationError(
                "priority must be an integer from 1 through 5"
            )
        _require_aware_datetime(self.created_at, "created_at")
        if self.due_date is not None and (
            not isinstance(self.due_date, date) or isinstance(self.due_date, datetime)
        ):
            raise SchedulerValidationError("due_date must be a date when provided")
        if self.earliest_start_at is not None:
            _require_aware_datetime(self.earliest_start_at, "earliest_start_at")
        if not isinstance(self.splitting_allowed, bool):
            raise SchedulerValidationError("splitting_allowed must be a boolean")


@dataclass(frozen=True, slots=True)
class TaskProgress:
    """An immutable record of positive completed work."""

    task_id: str
    completed_minutes: int
    recorded_at: datetime

    def __post_init__(self) -> None:
        _require_non_empty_string(self.task_id, "task_id")
        _require_integer(self.completed_minutes, "completed_minutes", 1)
        _require_aware_datetime(self.recorded_at, "recorded_at")


@dataclass(frozen=True, slots=True)
class SchedulerConfiguration:
    """Explicit, deterministic limits for a single planning day."""

    day_start: time = time(8, 0)
    day_end: time = time(18, 0)
    buffer_minutes: int = 10
    minimum_free_time_minutes: int = 30
    minimum_segment_minutes: int = 15
    maximum_task_segments: int = 3

    def __post_init__(self) -> None:
        if not isinstance(self.day_start, time) or not isinstance(self.day_end, time):
            raise SchedulerValidationError("day bounds must be local times")
        if self.day_start.tzinfo is not None or self.day_end.tzinfo is not None:
            raise SchedulerValidationError(
                "day bounds must be timezone-naive local times"
            )
        if self.day_end <= self.day_start:
            raise SchedulerValidationError("day_end must be after day_start")
        for field_name, value, minimum in (
            ("buffer_minutes", self.buffer_minutes, 0),
            ("minimum_free_time_minutes", self.minimum_free_time_minutes, 1),
            ("minimum_segment_minutes", self.minimum_segment_minutes, 1),
            ("maximum_task_segments", self.maximum_task_segments, 1),
        ):
            _require_integer(value, field_name, minimum)


@dataclass(frozen=True, slots=True)
class ScheduleWarning:
    """A valid input condition that should be surfaced to callers."""

    code: WarningCode
    details: Mapping[str, str] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not isinstance(self.code, WarningCode):
            raise SchedulerValidationError("warning code must be a WarningCode")


@dataclass(frozen=True, slots=True)
class ScheduleRequest:
    """Validated inputs for a deterministic, one-day scheduling calculation."""

    planning_day: PlanningDay
    current_at: datetime
    fixed_events: tuple[FixedEvent, ...]
    interruptions: tuple[Interruption, ...]
    tasks: tuple[FlexibleTask, ...]
    task_progress: tuple[TaskProgress, ...] = ()
    configuration: SchedulerConfiguration = field(
        default_factory=SchedulerConfiguration
    )

    def __post_init__(self) -> None:
        if not isinstance(self.planning_day, PlanningDay):
            raise SchedulerValidationError("planning_day must be a PlanningDay")
        _require_aware_datetime(self.current_at, "current_at")
        if not isinstance(self.configuration, SchedulerConfiguration):
            raise SchedulerValidationError(
                "configuration must be a SchedulerConfiguration"
            )
        if not all(
            isinstance(values, tuple)
            for values in (
                self.fixed_events,
                self.interruptions,
                self.tasks,
                self.task_progress,
            )
        ):
            raise SchedulerValidationError("request collections must be tuples")
        if not all(isinstance(event, FixedEvent) for event in self.fixed_events):
            raise SchedulerValidationError(
                "fixed_events must contain FixedEvent values"
            )
        if not all(isinstance(item, Interruption) for item in self.interruptions):
            raise SchedulerValidationError(
                "interruptions must contain Interruption values"
            )
        if not all(isinstance(item, FlexibleTask) for item in self.tasks):
            raise SchedulerValidationError("tasks must contain FlexibleTask values")
        if not all(isinstance(item, TaskProgress) for item in self.task_progress):
            raise SchedulerValidationError(
                "task_progress must contain TaskProgress values"
            )
        self._validate_unique_ids(self.fixed_events, "fixed event")
        self._validate_unique_ids(self.interruptions, "interruption")
        self._validate_unique_ids(self.tasks, "task")
        for index, event in enumerate(self.fixed_events):
            for other_event in self.fixed_events[index + 1 :]:
                if event.interval.overlaps(other_event.interval):
                    raise SchedulerValidationError("fixed events must not overlap")
        task_ids = {task.id for task in self.tasks}
        completed_minutes = {task_id: 0 for task_id in task_ids}
        for progress in self.task_progress:
            if progress.task_id not in task_ids:
                raise SchedulerValidationError(
                    "task progress must reference a task in the request"
                )
            completed_minutes[progress.task_id] += progress.completed_minutes
        task_by_id = {task.id: task for task in self.tasks}
        for task_id, total in completed_minutes.items():
            if total > task_by_id[task_id].estimated_minutes:
                raise SchedulerValidationError(
                    "task progress must not exceed the task estimate"
                )

    @property
    def warnings(self) -> tuple[ScheduleWarning, ...]:
        """Describe interruption/fixed-event overlaps without rejecting them."""
        warnings: list[ScheduleWarning] = []
        for interruption in self.interruptions:
            for event in self.fixed_events:
                if interruption.interval.overlaps(event.interval):
                    warnings.append(
                        ScheduleWarning(
                            code=WarningCode.LOCKED_TIME_OVERLAP_MERGED,
                            details={
                                "interruption_id": interruption.id,
                                "fixed_event_id": event.id,
                            },
                        )
                    )
        return tuple(warnings)

    @staticmethod
    def _validate_unique_ids(items: tuple[object, ...], item_name: str) -> None:
        ids = [item.id for item in items]
        if len(ids) != len(set(ids)):
            raise SchedulerValidationError(f"{item_name} ids must be unique")


@dataclass(frozen=True, slots=True)
class ScheduleItem:
    """One result block, optionally linked to the task it represents."""

    kind: ScheduleItemKind
    interval: TimeInterval
    task_id: str | None = None

    def __post_init__(self) -> None:
        if not isinstance(self.kind, ScheduleItemKind):
            raise SchedulerValidationError(
                "schedule item kind must be a ScheduleItemKind"
            )
        if not isinstance(self.interval, TimeInterval):
            raise SchedulerValidationError(
                "schedule item interval must be a TimeInterval"
            )
        if self.kind is ScheduleItemKind.TASK and self.task_id is None:
            raise SchedulerValidationError("task schedule items must include task_id")
        if self.task_id is not None:
            _require_non_empty_string(self.task_id, "task_id")


@dataclass(frozen=True, slots=True)
class ScheduleDecision:
    """A structured explanation for a placement, deferral, or warning."""

    reason_code: DecisionReasonCode
    task_id: str | None = None
    details: Mapping[str, str] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not isinstance(self.reason_code, DecisionReasonCode):
            raise SchedulerValidationError("reason_code must be a DecisionReasonCode")
        if self.task_id is not None:
            _require_non_empty_string(self.task_id, "task_id")


@dataclass(frozen=True, slots=True)
class ScheduleResult:
    """Framework-free output of a scheduling calculation."""

    items: tuple[ScheduleItem, ...]
    decisions: tuple[ScheduleDecision, ...]
    warnings: tuple[ScheduleWarning, ...] = ()

    def __post_init__(self) -> None:
        if not all(
            isinstance(values, tuple)
            for values in (self.items, self.decisions, self.warnings)
        ):
            raise SchedulerValidationError("result collections must be tuples")
        if not all(isinstance(item, ScheduleItem) for item in self.items):
            raise SchedulerValidationError("items must contain ScheduleItem values")
        if not all(
            isinstance(decision, ScheduleDecision) for decision in self.decisions
        ):
            raise SchedulerValidationError(
                "decisions must contain ScheduleDecision values"
            )
        if not all(isinstance(warning, ScheduleWarning) for warning in self.warnings):
            raise SchedulerValidationError(
                "warnings must contain ScheduleWarning values"
            )
