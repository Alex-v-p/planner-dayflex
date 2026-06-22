"""Independent recovery edge cases for interruption-aware rescheduling."""

from datetime import date, time

import pytest

from scheduler_core import (
    DecisionReasonCode,
    FlexibleTask,
    Interruption,
    PlanningDay,
    ScheduleRequest,
    SchedulerConfiguration,
    SchedulerValidationError,
    TaskProgress,
    TimeInterval,
    local_datetime,
    reschedule,
    schedule,
)


DAY = date(2026, 6, 22)
ZONE = "Europe/Brussels"
CONFIGURATION = SchedulerConfiguration(day_end=time(12), buffer_minutes=0)


def at(hour: int, minute: int = 0):
    """Build a valid instant for the recovery test day."""
    return local_datetime(DAY, time(hour, minute), ZONE)


def task(task_id: str, priority: int) -> FlexibleTask:
    """Build an hour-long task with deterministic creation order."""
    return FlexibleTask(task_id, task_id, 60, priority, at(8))


def request(*, tasks=(), interruptions=(), current_at=None) -> ScheduleRequest:
    """Build a small recovery request with no unrelated locked time."""
    return ScheduleRequest(
        planning_day=PlanningDay(DAY, ZONE),
        current_at=current_at or at(8),
        fixed_events=(),
        interruptions=interruptions,
        tasks=tasks,
        configuration=CONFIGURATION,
    )


def test_indirectly_moved_work_is_labeled_after_an_interruption() -> None:
    """Every task whose revised time changes exposes the stable moved reason."""
    tasks = (task("affected", 5), task("displaced", 4))
    initial_result = schedule(request(tasks=tasks))

    result = reschedule(
        initial_result,
        request(
            tasks=tasks,
            interruptions=(Interruption("lost-hour", TimeInterval(at(8), at(9))),),
        ),
    )

    assert [item.interval for item in result.items if item.task_id == "displaced"] == [
        TimeInterval(at(10), at(11))
    ]
    assert [
        decision.reason_code
        for decision in result.decisions
        if decision.task_id == "displaced"
    ] == [
        DecisionReasonCode.PLACED_IN_EARLIEST_VALID_WINDOW,
        DecisionReasonCode.MOVED_AFTER_INTERRUPTION,
    ]


@pytest.mark.parametrize("previous_result", [None, object()])
def test_reschedule_rejects_a_non_result_previous_plan(
    previous_result: object,
) -> None:
    """The public recovery entry point validates its historical plan contract."""
    with pytest.raises(SchedulerValidationError, match="previous_result"):
        reschedule(previous_result, request())  # type: ignore[arg-type]


def test_completed_task_is_not_scheduled_again_after_recovery() -> None:
    """Full completion becomes immutable history rather than remaining work."""
    completed = task("completed", 5)
    initial_result = schedule(request(tasks=(completed,)))
    recovery_request = ScheduleRequest(
        planning_day=PlanningDay(DAY, ZONE),
        current_at=at(9),
        fixed_events=(),
        interruptions=(),
        tasks=(completed,),
        task_progress=(TaskProgress("completed", 60, at(9)),),
        configuration=CONFIGURATION,
    )

    result = reschedule(initial_result, recovery_request)

    assert [item.interval for item in result.items if item.task_id == "completed"] == [
        TimeInterval(at(8), at(9))
    ]


def test_partial_completion_preserves_history_and_only_replans_open_minutes() -> None:
    """Recovery retains completed minutes and only places the unfinished portion."""
    focus = task("focus", 5)
    initial_result = schedule(request(tasks=(focus,)))
    recovery_request = ScheduleRequest(
        planning_day=PlanningDay(DAY, ZONE),
        current_at=at(8, 30),
        fixed_events=(),
        interruptions=(),
        tasks=(focus,),
        task_progress=(TaskProgress("focus", 30, at(8, 30)),),
        configuration=CONFIGURATION,
    )

    result = reschedule(initial_result, recovery_request)

    assert [item.interval for item in result.items if item.task_id == "focus"] == [
        TimeInterval(at(8), at(8, 30)),
        TimeInterval(at(8, 30), at(9)),
    ]


def test_interrupted_deadline_task_that_cannot_fit_has_deadline_reason() -> None:
    """Deadline pressure stays visible when recovery leaves no fitting window."""
    deadline_task = FlexibleTask("deadline", "deadline", 90, 5, at(8), due_date=DAY)
    configuration = SchedulerConfiguration(day_end=time(10), buffer_minutes=0)
    initial_request = ScheduleRequest(
        PlanningDay(DAY, ZONE),
        at(8),
        (),
        (),
        (deadline_task,),
        configuration=configuration,
    )
    initial_result = schedule(initial_request)
    recovery_request = ScheduleRequest(
        PlanningDay(DAY, ZONE),
        at(8),
        (),
        (Interruption("lost-hour", TimeInterval(at(8), at(9))),),
        (deadline_task,),
        configuration=configuration,
    )

    result = reschedule(initial_result, recovery_request)

    assert not [item for item in result.items if item.task_id == "deadline"]
    assert [
        decision.reason_code
        for decision in result.decisions
        if decision.task_id == "deadline"
    ] == [DecisionReasonCode.INSUFFICIENT_TIME_BEFORE_DEADLINE]
