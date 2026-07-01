"""Planning input use cases."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from api_service.contracts.planning import (
    FixedEventCreateRequest,
    FixedEventUpdateRequest,
    PlanningDayCreateRequest,
    TaskCreateRequest,
    TaskUpdateRequest,
    UserPreferencesRequest,
)
from api_service.infrastructure.models import (
    FixedEvent,
    PlanningDay,
    Task,
    UserPreferences,
)


class PlanningResourceNotFoundError(Exception):
    """Raised when a user-scoped planning resource is missing."""


class PlanningConflictError(Exception):
    """Raised when a request conflicts with existing planning inputs."""


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
