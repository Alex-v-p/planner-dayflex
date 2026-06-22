"""Tests for deterministic placement in the daily scheduling core."""

from datetime import date, time

from scheduler_core import (
    DecisionReasonCode,
    FixedEvent,
    FlexibleTask,
    Interruption,
    PlanningDay,
    ScheduleItem,
    ScheduleItemKind,
    ScheduleRequest,
    SchedulerConfiguration,
    TimeInterval,
    local_datetime,
    schedule,
)


DAY = date(2026, 6, 22)
ZONE = "Europe/Brussels"


def at(hour: int, minute: int = 0):
    """Return an unambiguous instant on the canonical planning day."""
    return local_datetime(DAY, time(hour, minute), ZONE)


def interval(
    start_hour: int,
    end_hour: int,
    start_minute: int = 0,
    end_minute: int = 0,
) -> TimeInterval:
    """Create a half-open interval on the canonical planning day."""
    return TimeInterval(at(start_hour, start_minute), at(end_hour, end_minute))


def task(
    task_id: str,
    minutes: int,
    priority: int = 3,
    *,
    created_at=None,
    due_date=None,
    splitting_allowed: bool = False,
) -> FlexibleTask:
    """Build a valid task with concise scheduling-test defaults."""
    return FlexibleTask(
        task_id,
        task_id.replace("-", " "),
        minutes,
        priority,
        created_at or at(8),
        due_date=due_date,
        splitting_allowed=splitting_allowed,
    )


def request(
    *,
    fixed_events=(),
    interruptions=(),
    tasks=(),
    configuration: SchedulerConfiguration | None = None,
) -> ScheduleRequest:
    """Build the common one-day request used by placement tests."""
    return ScheduleRequest(
        PlanningDay(DAY, ZONE),
        at(8),
        fixed_events,
        interruptions,
        tasks,
        configuration=configuration or SchedulerConfiguration(),
    )


def test_canonical_initial_plan_is_an_exact_chronological_fixture() -> None:
    """The shared initial-day scenario applies selection order and earliest slots."""
    result = schedule(
        request(
            fixed_events=(
                FixedEvent("meeting", "Team meeting", interval(9, 10)),
                FixedEvent("lunch", "Lunch appointment", interval(12, 13)),
                FixedEvent(
                    "collection",
                    "Collection appointment",
                    interval(15, 16, 30),
                ),
            ),
            tasks=(
                task("inbox", 45, 4),
                task("report", 90, 5),
                task("study", 90, 3, splitting_allowed=True),
                task("groceries", 30, 2, due_date=DAY),
            ),
        )
    )

    assert result.items == (
        ScheduleItem(ScheduleItemKind.TASK, interval(8, 8, 0, 45), "inbox"),
        ScheduleItem(ScheduleItemKind.BUFFER, interval(8, 8, 45, 55)),
        ScheduleItem(ScheduleItemKind.FIXED_EVENT, interval(9, 10)),
        ScheduleItem(ScheduleItemKind.TASK, interval(10, 11, 0, 30), "report"),
        ScheduleItem(ScheduleItemKind.BUFFER, interval(11, 11, 30, 40)),
        ScheduleItem(ScheduleItemKind.FIXED_EVENT, interval(12, 13)),
        ScheduleItem(ScheduleItemKind.TASK, interval(13, 14, 0, 30), "study"),
        ScheduleItem(ScheduleItemKind.BUFFER, interval(14, 14, 30, 40)),
        ScheduleItem(ScheduleItemKind.TASK, interval(14, 15, 40, 10), "groceries"),
        ScheduleItem(ScheduleItemKind.BUFFER, interval(15, 15, 10, 20)),
        ScheduleItem(ScheduleItemKind.FIXED_EVENT, interval(15, 16, 30)),
        ScheduleItem(
            ScheduleItemKind.DESIGNATED_FREE_TIME,
            interval(16, 18),
        ),
    )
    assert [decision.task_id for decision in result.decisions[:4]] == [
        "report",
        "inbox",
        "study",
        "groceries",
    ]


def test_selection_policy_uses_priority_deadline_duration_and_stable_ties() -> None:
    """Task selection follows the documented sort key before placement."""
    configuration = SchedulerConfiguration(day_end=time(12), buffer_minutes=0)
    result = schedule(
        request(
            configuration=configuration,
            tasks=(
                task("no-deadline", 15, 3),
                task("later-deadline", 15, 3, due_date=date(2026, 6, 23)),
                task("long", 30, 3, due_date=DAY),
                task("second-id", 15, 3, due_date=DAY, created_at=at(9)),
                task("first-id", 15, 3, due_date=DAY, created_at=at(9)),
                task("short", 15, 3, due_date=DAY, created_at=at(8, 30)),
            ),
        )
    )

    assert [
        decision.task_id
        for decision in result.decisions
        if decision.reason_code is DecisionReasonCode.PLACED_IN_EARLIEST_VALID_WINDOW
    ] == [
        "short",
        "first-id",
        "second-id",
        "long",
        "later-deadline",
        "no-deadline",
    ]


def test_task_that_cannot_fit_is_returned_with_a_structured_reason() -> None:
    """Unscheduled work is represented by its task-scoped decision, not dropped."""
    result = schedule(
        request(
            fixed_events=(FixedEvent("meeting", "Meeting", interval(8, 9)),),
            tasks=(task("deep-work", 120),),
            configuration=SchedulerConfiguration(day_end=time(10)),
        )
    )

    assert not [item for item in result.items if item.task_id == "deep-work"]
    unscheduled = [decision for decision in result.decisions if decision.task_id]
    assert len(unscheduled) == 1
    assert unscheduled[0].reason_code is (
        DecisionReasonCode.INSUFFICIENT_REMAINING_DAY_TIME
    )
    assert unscheduled[0].task_id == "deep-work"


def test_buffer_is_reserved_only_when_the_full_interval_fits() -> None:
    """A buffer uses spare space but never invalidates a valid task placement."""
    configuration = SchedulerConfiguration(day_end=time(9), buffer_minutes=10)
    with_buffer = schedule(
        request(tasks=(task("short", 50),), configuration=configuration)
    )
    without_buffer = schedule(
        request(tasks=(task("tight", 55),), configuration=configuration)
    )

    assert ScheduleItem(ScheduleItemKind.BUFFER, interval(8, 9, 50, 0)) in (
        with_buffer.items
    )
    assert not [
        item for item in without_buffer.items if item.kind is ScheduleItemKind.BUFFER
    ]


def test_only_useful_remaining_windows_are_promoted_to_free_time() -> None:
    """Gaps below the configured threshold remain ordinary unscheduled space."""
    result = schedule(
        request(
            tasks=(task("focus", 20),),
            configuration=SchedulerConfiguration(
                day_end=time(9),
                buffer_minutes=0,
                minimum_free_time_minutes=30,
            ),
        )
    )

    assert [
        item
        for item in result.items
        if item.kind is ScheduleItemKind.DESIGNATED_FREE_TIME
    ] == [ScheduleItem(ScheduleItemKind.DESIGNATED_FREE_TIME, interval(8, 9, 20, 0))]


def test_allowed_split_uses_useful_segments_and_reports_the_fact() -> None:
    """A split task uses the earliest feasible windows and minimum segment size."""
    result = schedule(
        request(
            fixed_events=(
                FixedEvent("first", "First", interval(8, 9, 30, 0)),
                FixedEvent("second", "Second", interval(10, 10, 0, 30)),
            ),
            tasks=(task("study", 75, splitting_allowed=True),),
            configuration=SchedulerConfiguration(day_end=time(11)),
        )
    )

    task_segments = [item.interval for item in result.items if item.task_id == "study"]
    assert task_segments == [interval(8, 8, 0, 30), interval(9, 9, 0, 45)]
    assert DecisionReasonCode.SPLIT_ACROSS_AVAILABLE_WINDOWS in {
        decision.reason_code for decision in result.decisions
    }


def test_identical_input_is_deterministic_and_tasks_never_overlap_locked_time() -> None:
    """Repeated scheduling is stable and task segments avoid every locked interval."""
    schedule_request = request(
        fixed_events=(FixedEvent("meeting", "Meeting", interval(9, 10)),),
        interruptions=(Interruption("delay", interval(10, 11)),),
        tasks=(
            task("priority", 75, 5),
            task("split", 90, 3, splitting_allowed=True),
        ),
        configuration=SchedulerConfiguration(day_end=time(14)),
    )

    first = schedule(schedule_request)
    second = schedule(schedule_request)
    task_items = [item for item in first.items if item.kind is ScheduleItemKind.TASK]
    locked = [
        source.interval
        for source in (*schedule_request.fixed_events, *schedule_request.interruptions)
    ]

    assert first == second
    for index, item in enumerate(task_items):
        assert not any(item.interval.overlaps(block) for block in locked)
        assert not any(
            item.interval.overlaps(other.interval) for other in task_items[index + 1 :]
        )
