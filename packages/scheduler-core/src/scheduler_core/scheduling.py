"""Deterministic placement rules for a single planning day."""

from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime, timedelta, timezone
from itertools import combinations

from .contracts import (
    DecisionReasonCode,
    FlexibleTask,
    ScheduleDecision,
    ScheduleItem,
    ScheduleItemKind,
    ScheduleRequest,
    ScheduleResult,
    TimeInterval,
)


def schedule(request: ScheduleRequest) -> ScheduleResult:
    """Build a deterministic, chronological plan for one planning day.

    Tasks are selected by the documented priority policy, but each selection is
    placed in the earliest currently available window. This deliberately means
    a lower-priority task can appear earlier in the resulting timeline when a
    higher-priority task does not fit there.

    Interruptions are treated as locked time in this initial scheduler. The
    function does not preserve history or perform interruption-aware replanning;
    those concerns belong to the later recovery workflow.
    """
    day_start, day_end = _day_bounds(request)
    schedule_start = _later_of(day_start, request.current_at)
    if _at_or_after(schedule_start, day_end):
        schedule_start = day_end

    locked_intervals = _locked_intervals(request, day_start, day_end)
    occupied = list(locked_intervals)
    items = _locked_items(request, day_start, day_end)
    decisions: list[ScheduleDecision] = []

    for task in sorted(request.tasks, key=_task_selection_key):
        placement = _place_task(task, request, schedule_start, day_end, occupied)
        if placement is None:
            decisions.append(
                ScheduleDecision(
                    _no_fit_reason(task, request),
                    task.id,
                )
            )
            continue

        task_intervals, buffer_intervals = placement
        items.extend(
            ScheduleItem(ScheduleItemKind.TASK, interval, task.id)
            for interval in task_intervals
        )
        items.extend(
            ScheduleItem(ScheduleItemKind.BUFFER, interval)
            for interval in buffer_intervals
        )
        occupied.extend(task_intervals)
        occupied.extend(buffer_intervals)
        decisions.append(
            ScheduleDecision(
                DecisionReasonCode.PLACED_IN_EARLIEST_VALID_WINDOW, task.id
            )
        )
        if len(task_intervals) > 1:
            decisions.append(
                ScheduleDecision(
                    DecisionReasonCode.SPLIT_ACROSS_AVAILABLE_WINDOWS,
                    task.id,
                    {"segment_count": str(len(task_intervals))},
                )
            )

    free_windows = _available_windows(schedule_start, day_end, occupied)
    for interval in free_windows:
        if _duration_minutes(interval.start, interval.end) < (
            request.configuration.minimum_free_time_minutes
        ):
            continue
        items.append(ScheduleItem(ScheduleItemKind.DESIGNATED_FREE_TIME, interval))
        decisions.append(
            ScheduleDecision(
                DecisionReasonCode.DESIGNATED_FREE_TIME,
                details={
                    "start": interval.start.isoformat(),
                    "end": interval.end.isoformat(),
                },
            )
        )

    return ScheduleResult(
        items=tuple(sorted(items, key=_item_timeline_key)),
        decisions=tuple(decisions),
        warnings=request.warnings,
    )


def _day_bounds(request: ScheduleRequest) -> tuple[datetime, datetime]:
    """Return the planning-day bounds as validated timezone-aware instants."""
    from .contracts import local_datetime

    configuration = request.configuration
    return (
        local_datetime(
            request.planning_day.local_date,
            configuration.day_start,
            request.planning_day.time_zone,
        ),
        local_datetime(
            request.planning_day.local_date,
            configuration.day_end,
            request.planning_day.time_zone,
        ),
    )


def _locked_intervals(
    request: ScheduleRequest, day_start: datetime, day_end: datetime
) -> tuple[TimeInterval, ...]:
    """Clip and union all locked sources before deriving availability."""
    source_intervals = [event.interval for event in request.fixed_events] + [
        interruption.interval for interruption in request.interruptions
    ]
    clipped = [
        interval
        for source_interval in source_intervals
        if (interval := _clip_to_day(source_interval, day_start, day_end)) is not None
    ]
    return _merge_intervals(clipped)


def _locked_items(
    request: ScheduleRequest, day_start: datetime, day_end: datetime
) -> list[ScheduleItem]:
    """Retain source blocks in the plan while availability uses their union."""
    items: list[ScheduleItem] = []
    for event in request.fixed_events:
        interval = _clip_to_day(event.interval, day_start, day_end)
        if interval is not None:
            items.append(ScheduleItem(ScheduleItemKind.FIXED_EVENT, interval))
    for interruption in request.interruptions:
        interval = _clip_to_day(interruption.interval, day_start, day_end)
        if interval is not None:
            items.append(ScheduleItem(ScheduleItemKind.INTERRUPTION, interval))
    return items


def _place_task(
    task: FlexibleTask,
    request: ScheduleRequest,
    schedule_start: datetime,
    day_end: datetime,
    occupied: list[TimeInterval],
) -> tuple[tuple[TimeInterval, ...], tuple[TimeInterval, ...]] | None:
    """Place one task whole first, then split it only when explicitly allowed."""
    if task.due_date is not None and task.due_date < request.planning_day.local_date:
        return None

    earliest_start = schedule_start
    if task.earliest_start_at is not None:
        earliest_start = _later_of(earliest_start, task.earliest_start_at)
    if _at_or_after(earliest_start, day_end):
        return None

    available = _available_windows(earliest_start, day_end, occupied)
    candidate_windows = _candidate_windows(available, earliest_start, day_end)
    whole = _first_whole_placement(candidate_windows, task.estimated_minutes)
    if whole is not None:
        buffers = _buffers_after((whole,), candidate_windows, request)
        return (whole,), buffers

    if not task.splitting_allowed:
        return None
    split = _first_split_placement(candidate_windows, task.estimated_minutes, request)
    if split is None:
        return None
    buffers = _buffers_after(split, candidate_windows, request)
    return split, buffers


def _candidate_windows(
    available: tuple[TimeInterval, ...], earliest_start: datetime, deadline: datetime
) -> tuple[TimeInterval, ...]:
    """Apply a task's earliest start and deadline to current availability."""
    candidates: list[TimeInterval] = []
    for window in available:
        start = _later_of(window.start, earliest_start)
        end = _earlier_of(window.end, deadline)
        if _before(start, end):
            candidates.append(TimeInterval(start, end))
    return tuple(candidates)


def _first_whole_placement(
    windows: tuple[TimeInterval, ...], duration_minutes: int
) -> TimeInterval | None:
    """Find the earliest window that holds the task's complete duration."""
    for window in windows:
        end = _add_minutes(window.start, duration_minutes)
        if _at_or_before(end, window.end):
            return TimeInterval(window.start, end)
    return None


def _first_split_placement(
    windows: tuple[TimeInterval, ...], duration_minutes: int, request: ScheduleRequest
) -> tuple[TimeInterval, ...] | None:
    """Find the earliest feasible multi-window allocation for an allowed split."""
    minimum = request.configuration.minimum_segment_minutes
    maximum_segments = request.configuration.maximum_task_segments
    usable_windows = tuple(
        window
        for window in windows
        if _duration_minutes(window.start, window.end) >= minimum
    )

    for segment_count in range(2, maximum_segments + 1):
        if duration_minutes < segment_count * minimum:
            continue
        for selected in combinations(usable_windows, segment_count):
            capacities = tuple(
                _duration_minutes(window.start, window.end) for window in selected
            )
            if sum(capacities) < duration_minutes:
                continue
            allocations = _earliest_split_allocations(
                capacities, duration_minutes, minimum
            )
            if allocations is None:
                continue
            return tuple(
                TimeInterval(window.start, _add_minutes(window.start, allocation))
                for window, allocation in zip(selected, allocations, strict=True)
            )
    return None


def _earliest_split_allocations(
    capacities: tuple[int, ...], duration_minutes: int, minimum: int
) -> tuple[int, ...] | None:
    """Allocate as much as possible to each earlier selected window."""
    if any(capacity < minimum for capacity in capacities):
        return None
    if duration_minutes < len(capacities) * minimum:
        return None
    if sum(capacities) < duration_minutes:
        return None

    remaining = duration_minutes
    allocations: list[int] = []
    for index, capacity in enumerate(capacities):
        later_minimum = (len(capacities) - index - 1) * minimum
        allocation = min(capacity, remaining - later_minimum)
        if allocation < minimum:
            return None
        allocations.append(allocation)
        remaining -= allocation
    if remaining != 0:
        return None
    return tuple(allocations)


def _buffers_after(
    task_intervals: tuple[TimeInterval, ...],
    candidate_windows: tuple[TimeInterval, ...],
    request: ScheduleRequest,
) -> tuple[TimeInterval, ...]:
    """Reserve a full buffer after each segment only when its source window allows."""
    buffer_minutes = request.configuration.buffer_minutes
    if buffer_minutes == 0:
        return ()

    buffers: list[TimeInterval] = []
    for task_interval in task_intervals:
        containing_window = next(
            (
                window
                for window in candidate_windows
                if _at_or_after(task_interval.start, window.start)
                and _at_or_before(task_interval.end, window.end)
            ),
            None,
        )
        if containing_window is None:
            continue
        buffer_end = _add_minutes(task_interval.end, buffer_minutes)
        if _at_or_before(buffer_end, containing_window.end):
            buffers.append(TimeInterval(task_interval.end, buffer_end))
    return tuple(buffers)


def _no_fit_reason(task: FlexibleTask, request: ScheduleRequest) -> DecisionReasonCode:
    """Return the stable no-fit reason available to initial daily planning."""
    if task.due_date is not None and task.due_date <= request.planning_day.local_date:
        return DecisionReasonCode.INSUFFICIENT_TIME_BEFORE_DEADLINE
    return DecisionReasonCode.INSUFFICIENT_REMAINING_DAY_TIME


def _available_windows(
    start: datetime, end: datetime, occupied: list[TimeInterval]
) -> tuple[TimeInterval, ...]:
    """Derive chronological free intervals between merged occupied blocks."""
    if not _before(start, end):
        return ()
    blocks = _merge_intervals(
        interval
        for source_interval in occupied
        if (interval := _clip_to_day(source_interval, start, end)) is not None
    )
    windows: list[TimeInterval] = []
    cursor = start
    for block in blocks:
        if _before(cursor, block.start):
            windows.append(TimeInterval(cursor, block.start))
        cursor = _later_of(cursor, block.end)
    if _before(cursor, end):
        windows.append(TimeInterval(cursor, end))
    return tuple(windows)


def _merge_intervals(intervals: Iterable[TimeInterval]) -> tuple[TimeInterval, ...]:
    """Union overlapping or adjacent half-open intervals in chronological order."""
    ordered = sorted(intervals, key=lambda interval: _instant(interval.start))
    if not ordered:
        return ()

    merged: list[TimeInterval] = [ordered[0]]
    for interval in ordered[1:]:
        previous = merged[-1]
        if _at_or_before(interval.start, previous.end):
            if _before(previous.end, interval.end):
                merged[-1] = TimeInterval(previous.start, interval.end)
            continue
        merged.append(interval)
    return tuple(merged)


def _clip_to_day(
    interval: TimeInterval, start: datetime, end: datetime
) -> TimeInterval | None:
    """Clip an interval to a bounded planning range."""
    clipped_start = _later_of(interval.start, start)
    clipped_end = _earlier_of(interval.end, end)
    if not _before(clipped_start, clipped_end):
        return None
    return TimeInterval(clipped_start, clipped_end)


def _task_selection_key(task: FlexibleTask) -> tuple[object, ...]:
    """Implement the versioned priority/deadline/duration/stable-id policy."""
    return (
        -task.priority,
        task.due_date is None,
        task.due_date,
        task.estimated_minutes,
        _instant(task.created_at),
        task.id,
    )


def _item_timeline_key(item: ScheduleItem) -> tuple[object, ...]:
    """Keep public result items in deterministic chronological timeline order."""
    kind_order = {
        ScheduleItemKind.FIXED_EVENT: 0,
        ScheduleItemKind.INTERRUPTION: 1,
        ScheduleItemKind.TASK: 2,
        ScheduleItemKind.BUFFER: 3,
        ScheduleItemKind.DESIGNATED_FREE_TIME: 4,
    }
    return (
        _instant(item.interval.start),
        _instant(item.interval.end),
        kind_order[item.kind],
        item.task_id or "",
    )


def _add_minutes(value: datetime, minutes: int) -> datetime:
    """Add elapsed minutes while returning an explicit-offset result instant."""
    instant = _instant(value) + timedelta(minutes=minutes)
    local_value = instant.astimezone(value.tzinfo)
    return instant.astimezone(timezone(local_value.utcoffset()))


def _duration_minutes(start: datetime, end: datetime) -> int:
    """Return whole elapsed minutes between two instants."""
    return int((_instant(end) - _instant(start)).total_seconds() // 60)


def _instant(value: datetime) -> datetime:
    return value.astimezone(timezone.utc)


def _before(first: datetime, second: datetime) -> bool:
    return _instant(first) < _instant(second)


def _at_or_before(first: datetime, second: datetime) -> bool:
    return _instant(first) <= _instant(second)


def _at_or_after(first: datetime, second: datetime) -> bool:
    return _instant(first) >= _instant(second)


def _later_of(first: datetime, second: datetime) -> datetime:
    return first if _at_or_after(first, second) else second


def _earlier_of(first: datetime, second: datetime) -> datetime:
    return first if _at_or_before(first, second) else second
