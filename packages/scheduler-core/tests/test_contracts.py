"""Tests for scheduler-core's framework-free contracts and validation."""

from datetime import date, datetime, time
from zoneinfo import ZoneInfo

import pytest

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
    SchedulerConfiguration,
    SchedulerValidationError,
    TimeInterval,
    WarningCode,
    TaskProgress,
    local_datetime,
)


ZONE = "Europe/Brussels"
DAY = date(2026, 6, 22)


def at(hour: int, minute: int = 0):
    """Return an unambiguous instant on the canonical planning day."""
    return local_datetime(DAY, time(hour, minute), ZONE)


def interval(start_hour: int, end_hour: int) -> TimeInterval:
    """Create an interval on the canonical planning day."""
    return TimeInterval(at(start_hour), at(end_hour))


def task(task_id: str, priority: int = 3) -> FlexibleTask:
    """Create a minimal valid flexible task."""
    return FlexibleTask(
        id=task_id,
        title="Study notes",
        estimated_minutes=90,
        priority=priority,
        created_at=at(8),
        splitting_allowed=True,
    )


def test_canonical_day_can_be_expressed_with_scheduler_contracts() -> None:
    """The shared product scenario fits fully in the typed request/result model."""
    fixed_events = (
        FixedEvent("meeting", "Team meeting", interval(9, 10)),
        FixedEvent("lunch", "Lunch appointment", interval(12, 13)),
        FixedEvent(
            "collection", "Collection appointment", TimeInterval(at(15, 30), at(16))
        ),
    )
    request = ScheduleRequest(
        planning_day=PlanningDay(DAY, ZONE),
        current_at=at(8),
        fixed_events=fixed_events,
        interruptions=(),
        tasks=(
            FlexibleTask("inbox", "Reply to inbox", 45, 4, at(8)),
            FlexibleTask("report", "Write report", 90, 5, at(8)),
            task("study"),
            FlexibleTask("groceries", "Buy groceries", 30, 2, at(8), due_date=DAY),
        ),
    )
    result = ScheduleResult(
        items=(
            ScheduleItem(ScheduleItemKind.TASK, TimeInterval(at(8), at(9)), "inbox"),
            ScheduleItem(ScheduleItemKind.FIXED_EVENT, interval(9, 10)),
        ),
        decisions=(
            ScheduleDecision(
                DecisionReasonCode.PLACED_IN_EARLIEST_VALID_WINDOW, "inbox"
            ),
        ),
    )

    assert request.configuration == SchedulerConfiguration()
    assert result.items[0].task_id == "inbox"


def test_half_open_intervals_allow_adjacent_blocks() -> None:
    """A task may begin exactly when a preceding block ends."""
    assert not interval(9, 10).overlaps(interval(10, 11))


@pytest.mark.parametrize("priority", [0, 6])
def test_invalid_priority_is_rejected(priority: int) -> None:
    """Priority is restricted to the documented one-through-five range."""
    with pytest.raises(SchedulerValidationError, match="priority"):
        task("study", priority)


def test_reversed_or_naive_intervals_are_rejected() -> None:
    """Intervals need ordered, timezone-aware endpoints."""
    with pytest.raises(SchedulerValidationError, match="after start"):
        TimeInterval(at(10), at(9))
    with pytest.raises(SchedulerValidationError, match="timezone-aware"):
        TimeInterval(at(9).replace(tzinfo=None), at(10))


def test_daylight_saving_gaps_and_ambiguous_times_are_rejected_clearly() -> None:
    """DST wall-clock input needs a real time and an explicit ambiguity choice."""
    with pytest.raises(SchedulerValidationError, match="does not exist"):
        local_datetime(date(2026, 3, 29), time(2, 30), ZONE)
    with pytest.raises(SchedulerValidationError, match="ambiguous"):
        local_datetime(date(2026, 10, 25), time(2, 30), ZONE)

    first = local_datetime(date(2026, 10, 25), time(2, 30), ZONE, fold=0)
    second = local_datetime(date(2026, 10, 25), time(2, 30), ZONE, fold=1)
    assert first.utcoffset() != second.utcoffset()


def test_bad_split_configuration_is_rejected() -> None:
    """Segment duration and segment count must remain usable."""
    with pytest.raises(SchedulerValidationError, match="minimum_segment_minutes"):
        SchedulerConfiguration(minimum_segment_minutes=0)
    with pytest.raises(SchedulerValidationError, match="maximum_task_segments"):
        SchedulerConfiguration(maximum_task_segments=4)
    with pytest.raises(SchedulerValidationError, match="minimum_segment_minutes"):
        SchedulerConfiguration(minimum_segment_minutes=14)


def test_fixed_event_overlap_is_invalid_but_interruption_overlap_warns() -> None:
    """Fixed commitments conflict, while overlapping lost time can later be unioned."""
    planning_day = PlanningDay(DAY, ZONE)
    event = FixedEvent("meeting", "Team meeting", interval(9, 10))

    with pytest.raises(SchedulerValidationError, match="fixed events must not overlap"):
        ScheduleRequest(
            planning_day,
            at(8),
            (
                event,
                FixedEvent("review", "Review", TimeInterval(at(9, 30), at(10, 30))),
            ),
            (),
            (task("study"),),
        )

    request = ScheduleRequest(
        planning_day,
        at(8),
        (event,),
        (Interruption("delay", TimeInterval(at(9, 30), at(10, 30))),),
        (task("study"),),
    )

    assert request.warnings[0].code is WarningCode.LOCKED_TIME_OVERLAP_MERGED


def test_raw_zoneinfo_and_cumulative_progress_are_rejected() -> None:
    """Public contracts enforce DST normalization and task duration limits."""
    zone = ZoneInfo(ZONE)
    with pytest.raises(SchedulerValidationError, match="nonexistent"):
        TimeInterval(
            datetime(2026, 3, 29, 2, 30, tzinfo=zone),
            datetime(2026, 3, 29, 4, tzinfo=zone),
        )
    with pytest.raises(SchedulerValidationError, match="must not exceed"):
        ScheduleRequest(
            PlanningDay(DAY, ZONE),
            at(8),
            (),
            (),
            (task("study"),),
            (TaskProgress("study", 45, at(9)), TaskProgress("study", 46, at(10))),
        )


def test_repeated_hour_intervals_use_explicit_offsets() -> None:
    """UTC comparison preserves order across a DST fall-back."""
    first = local_datetime(date(2026, 10, 25), time(2, 30), ZONE, fold=0)
    second = local_datetime(date(2026, 10, 25), time(2), ZONE, fold=1)
    assert TimeInterval(first, second).overlaps(TimeInterval(first, second))
