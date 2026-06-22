"""Tests for deterministic interruption-aware recovery scheduling."""

from datetime import date, time

import pytest

from scheduler_core import (
    DecisionReasonCode,
    FixedEvent,
    FlexibleTask,
    Interruption,
    PlanningDay,
    ScheduleItem,
    ScheduleItemKind,
    ScheduleRequest,
    ScheduleWarning,
    SchedulerConfiguration,
    SchedulerValidationError,
    TaskProgress,
    TimeInterval,
    WarningCode,
    local_datetime,
    reschedule,
    schedule,
)


DAY = date(2026, 6, 22)
ZONE = "Europe/Brussels"


def at(hour: int, minute: int = 0):
    """Return a valid instant on the canonical planning day."""
    return local_datetime(DAY, time(hour, minute), ZONE)


def interval(
    start_hour: int,
    end_hour: int,
    start_minute: int = 0,
    end_minute: int = 0,
) -> TimeInterval:
    """Build a concise half-open interval for the canonical day."""
    return TimeInterval(at(start_hour, start_minute), at(end_hour, end_minute))


def task(
    task_id: str,
    minutes: int,
    priority: int,
    *,
    due_date: date | None = None,
    splitting_allowed: bool = False,
) -> FlexibleTask:
    """Create a task with the canonical stable creation time."""
    return FlexibleTask(
        task_id,
        task_id.replace("-", " "),
        minutes,
        priority,
        at(8),
        due_date=due_date,
        splitting_allowed=splitting_allowed,
    )


def request(
    *,
    current_at=None,
    fixed_events=(),
    interruptions=(),
    tasks=(),
    task_progress=(),
    configuration: SchedulerConfiguration | None = None,
) -> ScheduleRequest:
    """Build an immutable recovery request with common defaults."""
    return ScheduleRequest(
        PlanningDay(DAY, ZONE),
        current_at or at(8),
        fixed_events,
        interruptions,
        tasks,
        task_progress,
        configuration or SchedulerConfiguration(),
    )


def test_canonical_interruption_recovery_is_an_exact_fixture() -> None:
    """Completed history is retained while interrupted work moves deterministically."""
    fixed_events = (
        FixedEvent("meeting", "Team meeting", interval(9, 10)),
        FixedEvent("lunch", "Lunch appointment", interval(12, 13)),
        FixedEvent("collection", "Collection appointment", interval(15, 16, 30)),
    )
    tasks = (
        task("inbox", 45, 4),
        task("report", 90, 5),
        task("study", 90, 3, splitting_allowed=True),
        task("groceries", 30, 2, due_date=DAY),
    )
    initial_request = request(fixed_events=fixed_events, tasks=tasks)
    initial_result = schedule(initial_request)
    recovery_request = request(
        current_at=at(14),
        fixed_events=fixed_events,
        interruptions=(Interruption("delay", interval(14, 15, 0, 15)),),
        tasks=tasks,
        task_progress=(
            TaskProgress("inbox", 45, at(8, 45)),
            TaskProgress("report", 90, at(11, 30)),
            TaskProgress("study", 60, at(14)),
        ),
    )

    result = reschedule(initial_result, recovery_request)

    assert result.items == (
        ScheduleItem(ScheduleItemKind.TASK, interval(8, 8, 0, 45), "inbox"),
        ScheduleItem(ScheduleItemKind.TASK, interval(10, 11, 0, 30), "report"),
        ScheduleItem(ScheduleItemKind.TASK, interval(13, 14), "study"),
        ScheduleItem(ScheduleItemKind.INTERRUPTION, interval(14, 15, 0, 15)),
        ScheduleItem(ScheduleItemKind.FIXED_EVENT, interval(15, 16, 30)),
        ScheduleItem(ScheduleItemKind.TASK, interval(16, 16, 0, 30), "study"),
        ScheduleItem(ScheduleItemKind.BUFFER, interval(16, 16, 30, 40)),
        ScheduleItem(ScheduleItemKind.TASK, interval(16, 17, 40, 10), "groceries"),
        ScheduleItem(ScheduleItemKind.BUFFER, interval(17, 17, 10, 20)),
        ScheduleItem(ScheduleItemKind.DESIGNATED_FREE_TIME, interval(17, 18, 20)),
    )
    assert [decision.reason_code for decision in result.decisions] == [
        DecisionReasonCode.PLACED_IN_EARLIEST_VALID_WINDOW,
        DecisionReasonCode.MOVED_AFTER_INTERRUPTION,
        DecisionReasonCode.PLACED_IN_EARLIEST_VALID_WINDOW,
        DecisionReasonCode.MOVED_AFTER_INTERRUPTION,
        DecisionReasonCode.DESIGNATED_FREE_TIME,
    ]
    assert [decision.task_id for decision in result.decisions[:4]] == [
        "study",
        "study",
        "groceries",
        "groceries",
    ]
    assert not [
        item
        for item in result.items
        if item.task_id in {"inbox", "report"} and item.interval.start >= at(14)
    ]
    assert result == reschedule(initial_result, recovery_request)
    assert initial_result == schedule(initial_request)


def test_rescheduling_unions_fixed_and_interruption_locks_with_the_warning() -> None:
    """Overlapping locks remain unavailable once and retain the established warning."""
    fixed_events = (FixedEvent("meeting", "Meeting", interval(9, 10)),)
    focus = task("focus", 90, 5)
    initial_result = schedule(
        request(
            fixed_events=fixed_events,
            tasks=(focus,),
            configuration=SchedulerConfiguration(day_end=time(12), buffer_minutes=0),
        )
    )

    result = reschedule(
        initial_result,
        request(
            current_at=at(9),
            fixed_events=fixed_events,
            interruptions=(Interruption("delay", interval(9, 10, 0, 30)),),
            tasks=(focus,),
            configuration=SchedulerConfiguration(day_end=time(12), buffer_minutes=0),
        ),
    )

    assert [item.interval for item in result.items if item.task_id == "focus"] == [
        interval(10, 12, 30)
    ]
    assert result.warnings == (
        ScheduleWarning(
            WarningCode.LOCKED_TIME_OVERLAP_MERGED,
            {"interruption_id": "delay", "fixed_event_id": "meeting"},
        ),
    )
    assert DecisionReasonCode.MOVED_AFTER_INTERRUPTION in {
        decision.reason_code for decision in result.decisions
    }


def test_interrupted_work_that_no_longer_fits_has_a_stable_no_fit_reason() -> None:
    """Recovery never drops unfinished interrupted work when the day is full."""
    focus = task("focus", 90, 5)
    configuration = SchedulerConfiguration(day_end=time(10), buffer_minutes=0)
    initial_result = schedule(request(tasks=(focus,), configuration=configuration))

    result = reschedule(
        initial_result,
        request(
            interruptions=(Interruption("delay", interval(8, 9, 0, 30)),),
            tasks=(focus,),
            configuration=configuration,
        ),
    )

    assert not [item for item in result.items if item.task_id == "focus"]
    assert [
        decision.reason_code
        for decision in result.decisions
        if decision.task_id == "focus"
    ] == [DecisionReasonCode.INSUFFICIENT_REMAINING_DAY_TIME]


def test_missed_prior_work_is_replanned_with_a_stable_current_time_reason() -> None:
    """Late rescheduling does not re-use an unfinished slot that is already past."""
    focus = task("focus", 30, 5)
    configuration = SchedulerConfiguration(day_end=time(10), buffer_minutes=0)
    initial_result = schedule(request(tasks=(focus,), configuration=configuration))

    result = reschedule(
        initial_result,
        request(current_at=at(9), tasks=(focus,), configuration=configuration),
    )

    assert [item.interval for item in result.items if item.task_id == "focus"] == [
        interval(9, 9, 0, 30)
    ]
    assert [
        decision.reason_code
        for decision in result.decisions
        if decision.task_id == "focus"
    ] == [
        DecisionReasonCode.PLACED_IN_EARLIEST_VALID_WINDOW,
        DecisionReasonCode.MISSED_BEFORE_CURRENT_TIME,
    ]


def test_rescheduling_rejects_progress_recorded_after_the_current_time() -> None:
    """A future completion record cannot be used to reduce recovery work."""
    focus = task("focus", 30, 5)
    initial_result = schedule(request(tasks=(focus,)))
    recovery_request = request(
        current_at=at(9),
        tasks=(focus,),
        task_progress=(TaskProgress("focus", 15, at(9, 1)),),
    )

    with pytest.raises(SchedulerValidationError, match="must not be recorded"):
        reschedule(initial_result, recovery_request)
