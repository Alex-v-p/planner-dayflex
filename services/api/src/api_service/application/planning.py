"""Planning input use cases."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, time
from zoneinfo import ZoneInfo
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from api_service.contracts.planning import (
    FixedEventCreateRequest,
    InterruptionCreateRequest,
    FixedEventUpdateRequest,
    PlanningDayCreateRequest,
    TaskProgressCreateRequest,
    TaskCreateRequest,
    TaskUpdateRequest,
    UserPreferencesRequest,
)
from api_service.infrastructure.scheduler_client import (
    ScheduleResultDTO,
    SchedulerClient,
    SchedulerUnavailableError,
    SchedulerValidationFailedError,
)
from api_service.infrastructure.models import (
    FixedEvent,
    Interruption,
    PlanningDay,
    ScheduleDecision,
    ScheduleItem,
    ScheduleSnapshot,
    Task,
    TaskProgress,
    UserPreferences,
)


class PlanningResourceNotFoundError(Exception):
    """Raised when a user-scoped planning resource is missing."""


class PlanningConflictError(Exception):
    """Raised when a request conflicts with existing planning inputs."""


class SchedulerUnavailablePlanningError(Exception):
    """Raised when the scheduler cannot produce a result right now."""


class SchedulerRejectedPlanningInputsError(Exception):
    """Raised when persisted inputs fail the scheduler contract."""


@dataclass(frozen=True)
class PlanningService:
    """Coordinate user-scoped planning input persistence."""

    def upsert_preferences(
        self, session: Session, user_id: str, request: UserPreferencesRequest
    ) -> UserPreferences:
        preferences = session.get(UserPreferences, user_id)
        if preferences is None:
            preferences = UserPreferences(user_id=user_id)
            session.add(preferences)
        preferences.time_zone = request.time_zone
        preferences.day_start_local = request.day_start_local
        preferences.day_end_local = request.day_end_local
        preferences.default_buffer_minutes = request.default_buffer_minutes
        session.commit()
        session.refresh(preferences)
        return preferences

    def get_preferences(self, session: Session, user_id: str) -> UserPreferences:
        preferences = session.get(UserPreferences, user_id)
        if preferences is None:
            raise PlanningResourceNotFoundError
        return preferences

    def delete_preferences(self, session: Session, user_id: str) -> None:
        preferences = session.get(UserPreferences, user_id)
        if preferences is None:
            raise PlanningResourceNotFoundError
        session.delete(preferences)
        session.commit()

    def create_planning_day(
        self, session: Session, user_id: str, request: PlanningDayCreateRequest
    ) -> PlanningDay:
        planning_day = PlanningDay(
            id=str(uuid4()),
            user_id=user_id,
            local_date=request.local_date,
            time_zone=request.time_zone,
            created_at=_utc_now(),
        )
        session.add(planning_day)
        try:
            session.commit()
        except IntegrityError as error:
            session.rollback()
            raise PlanningConflictError("Planning day already exists.") from error
        session.refresh(planning_day)
        return _normalize_planning_day(planning_day)

    def get_planning_day(
        self, session: Session, user_id: str, planning_day_id: str
    ) -> PlanningDay:
        planning_day = session.scalar(
            select(PlanningDay).where(
                PlanningDay.id == planning_day_id,
                PlanningDay.user_id == user_id,
            )
        )
        if planning_day is None:
            raise PlanningResourceNotFoundError
        return _normalize_planning_day(planning_day)

    def list_planning_days(self, session: Session, user_id: str) -> list[PlanningDay]:
        planning_days = list(
            session.scalars(
                select(PlanningDay)
                .where(PlanningDay.user_id == user_id)
                .order_by(PlanningDay.local_date, PlanningDay.created_at)
            )
        )
        return [_normalize_planning_day(planning_day) for planning_day in planning_days]

    def create_fixed_event(
        self,
        session: Session,
        user_id: str,
        planning_day_id: str,
        request: FixedEventCreateRequest,
    ) -> FixedEvent:
        self._get_planning_day_for_update(session, user_id, planning_day_id)
        self._ensure_no_fixed_event_overlap(
            session,
            planning_day_id,
            request.start_at,
            request.end_at,
        )
        now = _utc_now()
        fixed_event = FixedEvent(
            id=str(uuid4()),
            planning_day_id=planning_day_id,
            title=request.title,
            start_at=_as_utc(request.start_at),
            end_at=_as_utc(request.end_at),
            time_zone=request.time_zone,
            created_at=now,
            updated_at=now,
        )
        session.add(fixed_event)
        session.commit()
        session.refresh(fixed_event)
        return _normalize_fixed_event(fixed_event)

    def list_fixed_events(
        self, session: Session, user_id: str, planning_day_id: str
    ) -> list[FixedEvent]:
        self.get_planning_day(session, user_id, planning_day_id)
        fixed_events = list(
            session.scalars(
                select(FixedEvent)
                .where(FixedEvent.planning_day_id == planning_day_id)
                .order_by(FixedEvent.start_at, FixedEvent.created_at)
            )
        )
        return [_normalize_fixed_event(fixed_event) for fixed_event in fixed_events]

    def update_fixed_event(
        self,
        session: Session,
        user_id: str,
        planning_day_id: str,
        fixed_event_id: str,
        request: FixedEventUpdateRequest,
    ) -> FixedEvent:
        self._get_planning_day_for_update(session, user_id, planning_day_id)
        fixed_event = self._get_fixed_event(session, planning_day_id, fixed_event_id)
        self._ensure_no_fixed_event_overlap(
            session,
            planning_day_id,
            request.start_at,
            request.end_at,
            excluded_fixed_event_id=fixed_event_id,
        )
        fixed_event.title = request.title
        fixed_event.start_at = _as_utc(request.start_at)
        fixed_event.end_at = _as_utc(request.end_at)
        fixed_event.time_zone = request.time_zone
        fixed_event.updated_at = _utc_now()
        session.commit()
        session.refresh(fixed_event)
        return _normalize_fixed_event(fixed_event)

    def delete_fixed_event(
        self,
        session: Session,
        user_id: str,
        planning_day_id: str,
        fixed_event_id: str,
    ) -> None:
        self._get_planning_day_for_update(session, user_id, planning_day_id)
        fixed_event = self._get_fixed_event(session, planning_day_id, fixed_event_id)
        session.delete(fixed_event)
        session.commit()

    def create_task(
        self, session: Session, user_id: str, request: TaskCreateRequest
    ) -> Task:
        now = _utc_now()
        task = Task(
            id=str(uuid4()),
            user_id=user_id,
            title=request.title,
            estimated_minutes=request.estimated_minutes,
            priority=request.priority,
            due_date=request.due_date,
            earliest_start_at=(
                _as_utc(request.earliest_start_at)
                if request.earliest_start_at is not None
                else None
            ),
            splitting_allowed=request.splitting_allowed,
            min_segment_minutes=request.min_segment_minutes,
            status="active",
            created_at=now,
            updated_at=now,
        )
        session.add(task)
        session.commit()
        session.refresh(task)
        return _normalize_task(task)

    def list_tasks(self, session: Session, user_id: str) -> list[Task]:
        tasks = list(
            session.scalars(
                select(Task)
                .where(Task.user_id == user_id, Task.status == "active")
                .order_by(Task.created_at, Task.id)
            )
        )
        return [_normalize_task(task) for task in tasks]

    def update_task(
        self, session: Session, user_id: str, task_id: str, request: TaskUpdateRequest
    ) -> Task:
        task = self._get_active_task(session, user_id, task_id)
        task.title = request.title
        task.estimated_minutes = request.estimated_minutes
        task.priority = request.priority
        task.due_date = request.due_date
        task.earliest_start_at = (
            _as_utc(request.earliest_start_at)
            if request.earliest_start_at is not None
            else None
        )
        task.splitting_allowed = request.splitting_allowed
        task.min_segment_minutes = request.min_segment_minutes
        task.updated_at = _utc_now()
        session.commit()
        session.refresh(task)
        return _normalize_task(task)

    def remove_task(self, session: Session, user_id: str, task_id: str) -> None:
        task = self._get_active_task(session, user_id, task_id)
        task.status = "removed"
        task.updated_at = _utc_now()
        session.commit()

    def record_task_progress(
        self,
        session: Session,
        user_id: str,
        planning_day_id: str,
        request: TaskProgressCreateRequest,
    ) -> TaskProgress:
        self._get_planning_day_for_update(session, user_id, planning_day_id)
        task = self._get_active_task(session, user_id, request.task_id)
        completed_so_far = (
            session.scalar(
                select(
                    func.coalesce(func.sum(TaskProgress.completed_minutes), 0)
                ).where(
                    TaskProgress.planning_day_id == planning_day_id,
                    TaskProgress.task_id == task.id,
                )
            )
            or 0
        )
        if completed_so_far + request.completed_minutes > task.estimated_minutes:
            raise PlanningConflictError("Task progress cannot exceed the estimate.")
        now = _utc_now()
        progress = TaskProgress(
            id=str(uuid4()),
            task_id=task.id,
            planning_day_id=planning_day_id,
            completed_minutes=request.completed_minutes,
            recorded_at=_as_utc(request.recorded_at),
            created_at=now,
        )
        session.add(progress)
        session.commit()
        session.refresh(progress)
        return _normalize_task_progress(progress)

    def generate_plan(
        self,
        session: Session,
        user_id: str,
        planning_day_id: str,
        scheduler_client: SchedulerClient,
        *,
        scheduler_version: str,
    ) -> ScheduleSnapshot:
        planning_day = self._get_planning_day_for_update(
            session, user_id, planning_day_id
        )
        fixed_events = self._list_fixed_events_for_day(session, planning_day_id)
        interruptions = self._list_interruptions_for_day(session, planning_day_id)
        tasks = self._list_active_tasks_for_user(session, user_id)
        task_progress = self._list_task_progress_for_day(session, planning_day_id)
        preferences = session.get(UserPreferences, user_id)
        configuration = _scheduler_configuration(preferences)
        request = _scheduler_request(
            planning_day,
            fixed_events,
            interruptions,
            tasks,
            task_progress,
            configuration,
        )

        try:
            result = scheduler_client.schedule_day(request)
        except SchedulerValidationFailedError as error:
            session.rollback()
            raise SchedulerRejectedPlanningInputsError from error
        except SchedulerUnavailableError as error:
            session.rollback()
            raise SchedulerUnavailablePlanningError from error

        try:
            _validate_scheduler_result(result, tasks, fixed_events, interruptions)
            snapshot = self._persist_schedule_snapshot(
                session,
                planning_day,
                fixed_events,
                interruptions,
                result,
                configuration,
                scheduler_version,
            )
            session.commit()
        except Exception:
            session.rollback()
            raise
        session.refresh(snapshot)
        return self.get_schedule_snapshot(session, user_id, snapshot.id)

    def report_interruption_and_reschedule(
        self,
        session: Session,
        user_id: str,
        planning_day_id: str,
        request: InterruptionCreateRequest,
        scheduler_client: SchedulerClient,
        *,
        scheduler_version: str,
    ) -> ScheduleSnapshot:
        planning_day = self._get_planning_day_for_update(
            session, user_id, planning_day_id
        )
        if planning_day.current_snapshot_id is None:
            raise PlanningResourceNotFoundError

        previous_snapshot = self.get_schedule_snapshot(
            session, user_id, planning_day.current_snapshot_id
        )
        now = _utc_now()
        interruption = Interruption(
            id=str(uuid4()),
            planning_day_id=planning_day_id,
            start_at=_as_utc(request.start_at),
            end_at=_as_utc(request.end_at),
            time_zone=request.time_zone,
            reported_at=_as_utc(request.reported_at),
            created_at=now,
        )
        session.add(interruption)
        session.flush()

        fixed_events = self._list_fixed_events_for_day(session, planning_day_id)
        interruptions = self._list_interruptions_for_day(session, planning_day_id)
        tasks = self._list_active_tasks_for_user(session, user_id)
        task_progress = self._list_task_progress_for_day(session, planning_day_id)
        preferences = session.get(UserPreferences, user_id)
        configuration = _scheduler_configuration(preferences)
        schedule_request = _scheduler_request(
            planning_day,
            fixed_events,
            interruptions,
            tasks,
            task_progress,
            configuration,
            current_at=interruption.start_at,
        )

        try:
            result = scheduler_client.reschedule_day(
                _previous_result(previous_snapshot), schedule_request
            )
        except SchedulerValidationFailedError as error:
            session.rollback()
            raise SchedulerRejectedPlanningInputsError from error
        except SchedulerUnavailableError as error:
            session.rollback()
            raise SchedulerUnavailablePlanningError from error

        try:
            _validate_scheduler_result(result, tasks, fixed_events, interruptions)
            snapshot = self._persist_schedule_snapshot(
                session,
                planning_day,
                fixed_events,
                interruptions,
                result,
                configuration,
                scheduler_version,
            )
            session.commit()
        except Exception:
            session.rollback()
            raise
        session.refresh(snapshot)
        return self.get_schedule_snapshot(session, user_id, snapshot.id)

    def get_latest_schedule_snapshot(
        self, session: Session, user_id: str, planning_day_id: str
    ) -> ScheduleSnapshot:
        planning_day = self.get_planning_day(session, user_id, planning_day_id)
        if planning_day.current_snapshot_id is None:
            raise PlanningResourceNotFoundError
        return self.get_schedule_snapshot(
            session, user_id, planning_day.current_snapshot_id
        )

    def list_schedule_snapshots(
        self, session: Session, user_id: str, planning_day_id: str
    ) -> list[ScheduleSnapshot]:
        self.get_planning_day(session, user_id, planning_day_id)
        snapshots = list(
            session.scalars(
                select(ScheduleSnapshot)
                .where(ScheduleSnapshot.planning_day_id == planning_day_id)
                .order_by(ScheduleSnapshot.version)
            )
        )
        return [_normalize_schedule_snapshot(snapshot) for snapshot in snapshots]

    def get_schedule_snapshot(
        self, session: Session, user_id: str, snapshot_id: str
    ) -> ScheduleSnapshot:
        snapshot = session.scalar(
            select(ScheduleSnapshot)
            .join(PlanningDay, ScheduleSnapshot.planning_day_id == PlanningDay.id)
            .where(ScheduleSnapshot.id == snapshot_id, PlanningDay.user_id == user_id)
        )
        if snapshot is None:
            raise PlanningResourceNotFoundError
        return _normalize_schedule_snapshot(snapshot)

    def _get_fixed_event(
        self, session: Session, planning_day_id: str, fixed_event_id: str
    ) -> FixedEvent:
        fixed_event = session.scalar(
            select(FixedEvent).where(
                FixedEvent.id == fixed_event_id,
                FixedEvent.planning_day_id == planning_day_id,
            )
        )
        if fixed_event is None:
            raise PlanningResourceNotFoundError
        return fixed_event

    def _get_planning_day_for_update(
        self, session: Session, user_id: str, planning_day_id: str
    ) -> PlanningDay:
        planning_day = session.scalar(
            select(PlanningDay)
            .where(
                PlanningDay.id == planning_day_id,
                PlanningDay.user_id == user_id,
            )
            .with_for_update()
        )
        if planning_day is None:
            raise PlanningResourceNotFoundError
        return planning_day

    def _get_active_task(self, session: Session, user_id: str, task_id: str) -> Task:
        task = session.scalar(
            select(Task).where(
                Task.id == task_id,
                Task.user_id == user_id,
                Task.status == "active",
            )
        )
        if task is None:
            raise PlanningResourceNotFoundError
        return task

    def _ensure_no_fixed_event_overlap(
        self,
        session: Session,
        planning_day_id: str,
        start_at: datetime,
        end_at: datetime,
        *,
        excluded_fixed_event_id: str | None = None,
    ) -> None:
        requested_start = _as_utc(start_at)
        requested_end = _as_utc(end_at)
        query = select(FixedEvent).where(FixedEvent.planning_day_id == planning_day_id)
        if excluded_fixed_event_id is not None:
            query = query.where(FixedEvent.id != excluded_fixed_event_id)
        for fixed_event in session.scalars(query):
            existing_start = _as_utc(fixed_event.start_at)
            existing_end = _as_utc(fixed_event.end_at)
            if requested_start < existing_end and existing_start < requested_end:
                raise PlanningConflictError("Fixed events must not overlap.")

    def _list_fixed_events_for_day(
        self, session: Session, planning_day_id: str
    ) -> list[FixedEvent]:
        return [
            _normalize_fixed_event(fixed_event)
            for fixed_event in session.scalars(
                select(FixedEvent)
                .where(FixedEvent.planning_day_id == planning_day_id)
                .order_by(FixedEvent.start_at, FixedEvent.created_at)
            )
        ]

    def _list_interruptions_for_day(
        self, session: Session, planning_day_id: str
    ) -> list[Interruption]:
        return [
            _normalize_interruption(interruption)
            for interruption in session.scalars(
                select(Interruption)
                .where(Interruption.planning_day_id == planning_day_id)
                .order_by(Interruption.start_at, Interruption.created_at)
            )
        ]

    def _list_task_progress_for_day(
        self, session: Session, planning_day_id: str
    ) -> list[TaskProgress]:
        return [
            _normalize_task_progress(progress)
            for progress in session.scalars(
                select(TaskProgress)
                .where(TaskProgress.planning_day_id == planning_day_id)
                .order_by(TaskProgress.recorded_at, TaskProgress.created_at)
            )
        ]

    def _list_active_tasks_for_user(self, session: Session, user_id: str) -> list[Task]:
        return [
            _normalize_task(task)
            for task in session.scalars(
                select(Task)
                .where(Task.user_id == user_id, Task.status == "active")
                .order_by(Task.created_at, Task.id)
            )
        ]

    def _persist_schedule_snapshot(
        self,
        session: Session,
        planning_day: PlanningDay,
        fixed_events: list[FixedEvent],
        interruptions: list[Interruption],
        result: ScheduleResultDTO,
        configuration: dict[str, object],
        scheduler_version: str,
    ) -> ScheduleSnapshot:
        next_version = (
            session.scalar(
                select(func.max(ScheduleSnapshot.version)).where(
                    ScheduleSnapshot.planning_day_id == planning_day.id
                )
            )
            or 0
        ) + 1
        snapshot = ScheduleSnapshot(
            id=str(uuid4()),
            planning_day_id=planning_day.id,
            version=next_version,
            created_at=_utc_now(),
            scheduler_version=scheduler_version,
            configuration_json=configuration,
        )
        session.add(snapshot)
        session.flush()
        fixed_event_lookup = _fixed_event_lookup(fixed_events)
        interruption_lookup = _interruption_lookup(interruptions)
        for position, item in enumerate(result.items):
            start_at = _as_utc(datetime.fromisoformat(item.interval.start))
            end_at = _as_utc(datetime.fromisoformat(item.interval.end))
            session.add(
                ScheduleItem(
                    id=str(uuid4()),
                    snapshot_id=snapshot.id,
                    position=position,
                    kind=item.kind,
                    task_id=item.task_id,
                    fixed_event_id=(
                        fixed_event_lookup.get((start_at, end_at))
                        if item.kind == "fixed_event"
                        else None
                    ),
                    interruption_id=(
                        interruption_lookup.get((start_at, end_at))
                        if item.kind == "interruption"
                        else None
                    ),
                    start_at=start_at,
                    end_at=end_at,
                )
            )
        decision_position = 0
        for decision in result.decisions:
            session.add(
                ScheduleDecision(
                    id=str(uuid4()),
                    snapshot_id=snapshot.id,
                    position=decision_position,
                    task_id=decision.task_id,
                    reason_code=decision.reason_code,
                    details_json=dict(decision.details),
                )
            )
            decision_position += 1
        for warning in result.warnings:
            session.add(
                ScheduleDecision(
                    id=str(uuid4()),
                    snapshot_id=snapshot.id,
                    position=decision_position,
                    task_id=None,
                    reason_code=f"warning:{warning.code}",
                    details_json=dict(warning.details),
                )
            )
            decision_position += 1
        planning_day.current_snapshot_id = snapshot.id
        return snapshot


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _normalize_planning_day(planning_day: PlanningDay) -> PlanningDay:
    planning_day.created_at = _as_utc(planning_day.created_at)
    return planning_day


def _normalize_fixed_event(fixed_event: FixedEvent) -> FixedEvent:
    fixed_event.start_at = _as_utc(fixed_event.start_at)
    fixed_event.end_at = _as_utc(fixed_event.end_at)
    fixed_event.created_at = _as_utc(fixed_event.created_at)
    fixed_event.updated_at = _as_utc(fixed_event.updated_at)
    return fixed_event


def _normalize_task(task: Task) -> Task:
    if task.earliest_start_at is not None:
        task.earliest_start_at = _as_utc(task.earliest_start_at)
    task.created_at = _as_utc(task.created_at)
    task.updated_at = _as_utc(task.updated_at)
    return task


def _normalize_task_progress(progress: TaskProgress) -> TaskProgress:
    progress.recorded_at = _as_utc(progress.recorded_at)
    progress.created_at = _as_utc(progress.created_at)
    return progress


def _normalize_interruption(interruption: Interruption) -> Interruption:
    interruption.start_at = _as_utc(interruption.start_at)
    interruption.end_at = _as_utc(interruption.end_at)
    interruption.reported_at = _as_utc(interruption.reported_at)
    interruption.created_at = _as_utc(interruption.created_at)
    return interruption


def _normalize_schedule_snapshot(snapshot: ScheduleSnapshot) -> ScheduleSnapshot:
    snapshot.created_at = _as_utc(snapshot.created_at)
    time_zone = ZoneInfo(snapshot.planning_day.time_zone)
    for item in snapshot.items:
        item.start_at = _as_utc(item.start_at).astimezone(time_zone)
        item.end_at = _as_utc(item.end_at).astimezone(time_zone)
    return snapshot


def _scheduler_configuration(preferences: UserPreferences | None) -> dict[str, object]:
    return {
        "day_start": (
            preferences.day_start_local.isoformat()
            if preferences is not None
            else "08:00:00"
        ),
        "day_end": (
            preferences.day_end_local.isoformat()
            if preferences is not None
            else "18:00:00"
        ),
        "buffer_minutes": (
            preferences.default_buffer_minutes if preferences is not None else 10
        ),
        "minimum_free_time_minutes": 30,
        "minimum_segment_minutes": 15,
        "maximum_task_segments": 3,
    }


def _scheduler_request(
    planning_day: PlanningDay,
    fixed_events: list[FixedEvent],
    interruptions: list[Interruption],
    tasks: list[Task],
    task_progress: list[TaskProgress],
    configuration: dict[str, object],
    *,
    current_at: datetime | None = None,
) -> dict[str, object]:
    time_zone = ZoneInfo(planning_day.time_zone)
    scheduler_current_at = current_at or datetime.combine(
        planning_day.local_date,
        time.fromisoformat(str(configuration["day_start"])),
        time_zone,
    )
    return {
        "planning_day": {
            "local_date": planning_day.local_date.isoformat(),
            "time_zone": planning_day.time_zone,
        },
        "current_at": scheduler_current_at.astimezone(time_zone).isoformat(),
        "fixed_events": [
            {
                "id": fixed_event.id,
                "title": fixed_event.title,
                "interval": {
                    "start": fixed_event.start_at.astimezone(time_zone).isoformat(),
                    "end": fixed_event.end_at.astimezone(time_zone).isoformat(),
                },
            }
            for fixed_event in fixed_events
        ],
        "interruptions": [
            {
                "id": interruption.id,
                "interval": {
                    "start": interruption.start_at.astimezone(time_zone).isoformat(),
                    "end": interruption.end_at.astimezone(time_zone).isoformat(),
                },
            }
            for interruption in interruptions
        ],
        "tasks": [
            {
                "id": task.id,
                "title": task.title,
                "estimated_minutes": task.estimated_minutes,
                "priority": task.priority,
                "created_at": task.created_at.astimezone(time_zone).isoformat(),
                "due_date": task.due_date.isoformat() if task.due_date else None,
                "earliest_start_at": (
                    task.earliest_start_at.astimezone(time_zone).isoformat()
                    if task.earliest_start_at
                    else None
                ),
                "splitting_allowed": task.splitting_allowed,
            }
            for task in tasks
        ],
        "task_progress": [
            {
                "task_id": progress.task_id,
                "completed_minutes": progress.completed_minutes,
                "recorded_at": progress.recorded_at.astimezone(time_zone).isoformat(),
            }
            for progress in task_progress
        ],
        "configuration": configuration,
    }


def _fixed_event_lookup(
    fixed_events: list[FixedEvent],
) -> dict[tuple[datetime, datetime], str]:
    return {
        (_as_utc(fixed_event.start_at), _as_utc(fixed_event.end_at)): fixed_event.id
        for fixed_event in fixed_events
    }


def _interruption_lookup(
    interruptions: list[Interruption],
) -> dict[tuple[datetime, datetime], str]:
    return {
        (_as_utc(interruption.start_at), _as_utc(interruption.end_at)): interruption.id
        for interruption in interruptions
    }


def _previous_result(snapshot: ScheduleSnapshot) -> dict[str, object]:
    decisions: list[dict[str, object]] = []
    warnings: list[dict[str, object]] = []
    for decision in snapshot.decisions:
        if decision.reason_code.startswith("warning:"):
            warnings.append(
                {
                    "code": decision.reason_code.removeprefix("warning:"),
                    "details": dict(decision.details_json),
                }
            )
            continue
        decisions.append(
            {
                "reason_code": decision.reason_code,
                "task_id": decision.task_id,
                "details": dict(decision.details_json),
            }
        )
    return {
        "items": [
            {
                "kind": item.kind,
                "interval": {
                    "start": item.start_at.isoformat(),
                    "end": item.end_at.isoformat(),
                },
                "task_id": item.task_id,
            }
            for item in snapshot.items
        ],
        "decisions": decisions,
        "warnings": warnings,
    }


ALLOWED_SCHEDULER_ITEM_KINDS = {
    "task",
    "fixed_event",
    "interruption",
    "buffer",
    "designated_free_time",
}

ALLOWED_SCHEDULER_DECISION_REASON_CODES = {
    "placed_in_earliest_valid_window",
    "moved_after_interruption",
    "split_across_available_windows",
    "blocked_by_fixed_event",
    "blocked_by_interruption",
    "missed_before_current_time",
    "insufficient_time_before_deadline",
    "insufficient_remaining_day_time",
    "designated_free_time",
    "locked_time_overlap_merged",
}

ALLOWED_SCHEDULER_WARNING_CODES = {
    "locked_time_overlap_merged",
}


def _validate_scheduler_result(
    result: ScheduleResultDTO,
    tasks: list[Task],
    fixed_events: list[FixedEvent],
    interruptions: list[Interruption],
) -> None:
    active_task_ids = {task.id for task in tasks}
    fixed_event_intervals = set(_fixed_event_lookup(fixed_events))
    interruption_intervals = set(_interruption_lookup(interruptions))
    for item in result.items:
        if item.kind not in ALLOWED_SCHEDULER_ITEM_KINDS:
            raise SchedulerUnavailablePlanningError
        if item.kind == "task":
            if item.task_id is None or item.task_id not in active_task_ids:
                raise SchedulerUnavailablePlanningError
        elif item.task_id is not None:
            raise SchedulerUnavailablePlanningError
        if item.kind == "fixed_event":
            try:
                start_at = _as_utc(datetime.fromisoformat(item.interval.start))
                end_at = _as_utc(datetime.fromisoformat(item.interval.end))
            except ValueError as error:
                raise SchedulerUnavailablePlanningError from error
            if (start_at, end_at) not in fixed_event_intervals:
                raise SchedulerUnavailablePlanningError
        if item.kind == "interruption":
            try:
                start_at = _as_utc(datetime.fromisoformat(item.interval.start))
                end_at = _as_utc(datetime.fromisoformat(item.interval.end))
            except ValueError as error:
                raise SchedulerUnavailablePlanningError from error
            if (start_at, end_at) not in interruption_intervals:
                raise SchedulerUnavailablePlanningError

    for decision in result.decisions:
        if decision.reason_code not in ALLOWED_SCHEDULER_DECISION_REASON_CODES:
            raise SchedulerUnavailablePlanningError
        if decision.task_id is not None and decision.task_id not in active_task_ids:
            raise SchedulerUnavailablePlanningError

    for warning in result.warnings:
        if warning.code not in ALLOWED_SCHEDULER_WARNING_CODES:
            raise SchedulerUnavailablePlanningError
