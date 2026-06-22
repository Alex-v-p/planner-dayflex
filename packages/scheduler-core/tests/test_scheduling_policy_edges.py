"""Independent policy-edge tests for deterministic daily scheduling."""

from datetime import date, time
from itertools import combinations

from scheduler_core import (
    DecisionReasonCode,
    FixedEvent,
    FlexibleTask,
    Interruption,
    PlanningDay,
    ScheduleItemKind,
    ScheduleRequest,
    ScheduleWarning,
    SchedulerConfiguration,
    TimeInterval,
    WarningCode,
    local_datetime,
    schedule,
)


DAY = date(2026, 6, 22)
ZONE = "Europe/Brussels"


def at(hour: int, minute: int = 0):
    """Return a valid instant on the common planning day."""
    return local_datetime(DAY, time(hour, minute), ZONE)


def interval(
    start_hour: int, start_minute: int, end_hour: int, end_minute: int
) -> TimeInterval:
    """Build a half-open interval on the common planning day."""
    return TimeInterval(at(start_hour, start_minute), at(end_hour, end_minute))


def task(
    task_id: str,
    minutes: int,
    priority: int,
    *,
    due_date: date | None = None,
    earliest_start_at=None,
    splitting_allowed: bool = False,
) -> FlexibleTask:
    """Build a concise task with stable ordering defaults."""
    return FlexibleTask(
        task_id,
        task_id.replace("-", " "),
        minutes,
        priority,
        at(8),
        due_date=due_date,
        earliest_start_at=earliest_start_at,
        splitting_allowed=splitting_allowed,
    )


def request(
    *,
    fixed_events=(),
    interruptions=(),
    tasks=(),
    current_at=None,
    configuration: SchedulerConfiguration | None = None,
) -> ScheduleRequest:
    """Build a request with the production scheduler defaults where unchanged."""
    return ScheduleRequest(
        PlanningDay(DAY, ZONE),
        current_at or at(8),
        fixed_events,
        interruptions,
        tasks,
        configuration=configuration or SchedulerConfiguration(),
    )


def test_overlapping_fixed_and_interruption_time_is_unioned_and_warned() -> None:
    """Overlapping locked sources do not open an invalid gap or consume time twice."""
    result = schedule(
        request(
            fixed_events=(FixedEvent("meeting", "Meeting", interval(9, 0, 10, 0)),),
            interruptions=(Interruption("delay", interval(9, 30, 10, 30)),),
            tasks=(task("focus", 90, 5),),
            configuration=SchedulerConfiguration(day_end=time(12), buffer_minutes=0),
        )
    )

    assert [item.interval for item in result.items if item.task_id == "focus"] == [
        interval(10, 30, 12, 0)
    ]
    assert result.warnings == (
        ScheduleWarning(
            WarningCode.LOCKED_TIME_OVERLAP_MERGED,
            {"interruption_id": "delay", "fixed_event_id": "meeting"},
        ),
    )


def test_tasks_buffers_and_nonoverlapping_locked_items_never_overlap() -> None:
    """Reserved buffers remain conflict-free just like flexible task work."""
    result = schedule(
        request(
            fixed_events=(
                FixedEvent("first", "First", interval(8, 40, 9, 0)),
                FixedEvent("second", "Second", interval(10, 0, 10, 15)),
            ),
            tasks=(task("early", 25, 5), task("later", 45, 4)),
            configuration=SchedulerConfiguration(day_end=time(11)),
        )
    )

    assert [
        (item.kind, item.task_id, item.interval)
        for item in result.items
        if item.kind in {ScheduleItemKind.TASK, ScheduleItemKind.BUFFER}
    ] == [
        (ScheduleItemKind.TASK, "early", interval(8, 0, 8, 25)),
        (ScheduleItemKind.BUFFER, None, interval(8, 25, 8, 35)),
        (ScheduleItemKind.TASK, "later", interval(9, 0, 9, 45)),
        (ScheduleItemKind.BUFFER, None, interval(9, 45, 9, 55)),
    ]
    occupied = [
        item
        for item in result.items
        if item.kind
        in {
            ScheduleItemKind.FIXED_EVENT,
            ScheduleItemKind.INTERRUPTION,
            ScheduleItemKind.TASK,
            ScheduleItemKind.BUFFER,
        }
    ]
    assert not any(
        first.interval.overlaps(second.interval)
        for first, second in combinations(occupied, 2)
    )


def test_split_uses_segments_at_the_configured_minimum() -> None:
    """An allowed split can use a 15-minute segment but never a shorter one."""
    configuration = SchedulerConfiguration(day_end=time(9), buffer_minutes=0)
    result = schedule(
        request(
            fixed_events=(FixedEvent("break", "Break", interval(8, 15, 8, 30)),),
            tasks=(task("study", 45, 3, splitting_allowed=True),),
            configuration=configuration,
        )
    )

    segments = [item.interval for item in result.items if item.task_id == "study"]
    assert segments == [interval(8, 0, 8, 15), interval(8, 30, 9, 0)]
    assert all(
        (segment.end - segment.start).total_seconds() / 60
        >= configuration.minimum_segment_minutes
        for segment in segments
    )
    assert DecisionReasonCode.SPLIT_ACROSS_AVAILABLE_WINDOWS in {
        decision.reason_code for decision in result.decisions
    }


def test_split_over_the_three_segment_limit_is_atomic() -> None:
    """A task needing four minimum windows is deferred without partial output."""
    result = schedule(
        request(
            fixed_events=(
                FixedEvent("first", "First", interval(8, 15, 8, 30)),
                FixedEvent("second", "Second", interval(8, 45, 9, 0)),
                FixedEvent("third", "Third", interval(9, 15, 9, 30)),
            ),
            tasks=(task("four-parts", 60, 3, splitting_allowed=True),),
            configuration=SchedulerConfiguration(
                day_end=time(9, 45),
                buffer_minutes=0,
            ),
        )
    )

    assert not [item for item in result.items if item.task_id == "four-parts"]
    assert not [item for item in result.items if item.kind is ScheduleItemKind.BUFFER]
    assert [
        decision.reason_code
        for decision in result.decisions
        if decision.task_id == "four-parts"
    ] == [DecisionReasonCode.INSUFFICIENT_REMAINING_DAY_TIME]


def test_no_fit_on_its_due_date_returns_the_deadline_reason() -> None:
    """A task that cannot finish today is deferred with a deadline-specific fact."""
    result = schedule(
        request(
            fixed_events=(FixedEvent("meeting", "Meeting", interval(8, 0, 8, 30)),),
            tasks=(task("deadline-work", 45, 4, due_date=DAY),),
            configuration=SchedulerConfiguration(day_end=time(9), buffer_minutes=0),
        )
    )

    assert not [item for item in result.items if item.task_id == "deadline-work"]
    assert [
        decision.reason_code
        for decision in result.decisions
        if decision.task_id == "deadline-work"
    ] == [DecisionReasonCode.INSUFFICIENT_TIME_BEFORE_DEADLINE]


def test_current_time_and_earliest_start_bound_new_work() -> None:
    """New tasks respect both the current instant and an individual earliest start."""
    result = schedule(
        request(
            current_at=at(9, 30),
            tasks=(
                task("available-now", 30, 5),
                task("later-only", 30, 4, earliest_start_at=at(10)),
            ),
            configuration=SchedulerConfiguration(day_end=time(11), buffer_minutes=0),
        )
    )

    assert [
        (item.task_id, item.interval)
        for item in result.items
        if item.kind is ScheduleItemKind.TASK
    ] == [
        ("available-now", interval(9, 30, 10, 0)),
        ("later-only", interval(10, 0, 10, 30)),
    ]


def test_result_is_chronological_even_when_selection_order_is_not() -> None:
    """Priority controls selection, while the result remains timeline ordered."""
    result = schedule(
        request(
            fixed_events=(FixedEvent("meeting", "Meeting", interval(8, 30, 9, 30)),),
            tasks=(task("high-priority", 60, 5), task("lower-priority", 30, 4)),
            configuration=SchedulerConfiguration(day_end=time(11), buffer_minutes=0),
        )
    )

    assert [
        decision.task_id
        for decision in result.decisions
        if decision.reason_code is DecisionReasonCode.PLACED_IN_EARLIEST_VALID_WINDOW
    ] == ["high-priority", "lower-priority"]
    assert [item.task_id for item in result.items if item.task_id] == [
        "lower-priority",
        "high-priority",
    ]
    assert list(result.items) == sorted(
        result.items,
        key=lambda item: (item.interval.start, item.interval.end),
    )
