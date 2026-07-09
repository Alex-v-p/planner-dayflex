"""FastAPI routes for authenticated planning input persistence."""

from __future__ import annotations

from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from api_service.application.planning import (
    PlanningConflictError,
    PlanningResourceNotFoundError,
    PlanningService,
    SchedulerRejectedPlanningInputsError,
    SchedulerUnavailablePlanningError,
)
from api_service.config import Settings
from api_service.contracts.planning import (
    FixedEventCreateRequest,
    FixedEventResponse,
    FixedEventUpdateRequest,
    InterruptionCreateRequest,
    PlanningDayCreateRequest,
    PlanningDayResponse,
    ScheduleDecisionResponse,
    ScheduleItemResponse,
    ScheduleSnapshotResponse,
    ScheduleSnapshotSummaryResponse,
    TaskCreateRequest,
    TaskProgressCreateRequest,
    TaskProgressResponse,
    TaskResponse,
    TaskUpdateRequest,
    UserPreferencesRequest,
    UserPreferencesResponse,
)
from api_service.infrastructure.models import User
from api_service.infrastructure.scheduler_client import SchedulerClient
from api_service.interfaces.auth import get_current_user, get_session, get_settings


router = APIRouter(prefix="/planning", tags=["planning"])
planning_service = PlanningService()


@router.get("/preferences", response_model=UserPreferencesResponse)
def get_preferences(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> UserPreferencesResponse:
    """Return the authenticated user's planning defaults."""
    try:
        preferences = planning_service.get_preferences(session, user.id)
    except PlanningResourceNotFoundError as error:
        raise _not_found() from error
    return UserPreferencesResponse.model_validate(preferences)


@router.put("/preferences", response_model=UserPreferencesResponse)
def put_preferences(
    request: UserPreferencesRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> UserPreferencesResponse:
    """Create or replace the authenticated user's planning defaults."""
    preferences = planning_service.upsert_preferences(session, user.id, request)
    return UserPreferencesResponse.model_validate(preferences)


@router.delete("/preferences", status_code=status.HTTP_204_NO_CONTENT)
def delete_preferences(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> None:
    """Remove the authenticated user's planning defaults."""
    try:
        planning_service.delete_preferences(session, user.id)
    except PlanningResourceNotFoundError as error:
        raise _not_found() from error


@router.post(
    "/days",
    response_model=PlanningDayResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_planning_day(
    request: PlanningDayCreateRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> PlanningDayResponse:
    """Create one local planning day for the authenticated user."""
    try:
        planning_day = planning_service.create_planning_day(session, user.id, request)
    except PlanningConflictError as error:
        raise _conflict(str(error)) from error
    return PlanningDayResponse.model_validate(planning_day)


@router.get("/days", response_model=list[PlanningDayResponse])
def list_planning_days(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[PlanningDayResponse]:
    """List planning days owned by the authenticated user."""
    return [
        PlanningDayResponse.model_validate(planning_day)
        for planning_day in planning_service.list_planning_days(session, user.id)
    ]


@router.get("/days/{planning_day_id}", response_model=PlanningDayResponse)
def get_planning_day(
    planning_day_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> PlanningDayResponse:
    """Return one planning day owned by the authenticated user."""
    try:
        planning_day = planning_service.get_planning_day(
            session, user.id, planning_day_id
        )
    except PlanningResourceNotFoundError as error:
        raise _not_found() from error
    return PlanningDayResponse.model_validate(planning_day)


@router.post(
    "/days/{planning_day_id}/fixed-events",
    response_model=FixedEventResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_fixed_event(
    planning_day_id: str,
    request: FixedEventCreateRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> FixedEventResponse:
    """Create one fixed event on a user-owned planning day."""
    try:
        fixed_event = planning_service.create_fixed_event(
            session, user.id, planning_day_id, request
        )
    except PlanningResourceNotFoundError as error:
        raise _not_found() from error
    except PlanningConflictError as error:
        raise _conflict(str(error)) from error
    return FixedEventResponse.model_validate(fixed_event)


@router.get(
    "/days/{planning_day_id}/fixed-events",
    response_model=list[FixedEventResponse],
)
def list_fixed_events(
    planning_day_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[FixedEventResponse]:
    """List fixed events for one user-owned planning day."""
    try:
        fixed_events = planning_service.list_fixed_events(
            session, user.id, planning_day_id
        )
    except PlanningResourceNotFoundError as error:
        raise _not_found() from error
    return [
        FixedEventResponse.model_validate(fixed_event) for fixed_event in fixed_events
    ]


@router.put(
    "/days/{planning_day_id}/fixed-events/{fixed_event_id}",
    response_model=FixedEventResponse,
)
def update_fixed_event(
    planning_day_id: str,
    fixed_event_id: str,
    request: FixedEventUpdateRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> FixedEventResponse:
    """Replace one fixed event owned through the planning day."""
    try:
        fixed_event = planning_service.update_fixed_event(
            session, user.id, planning_day_id, fixed_event_id, request
        )
    except PlanningResourceNotFoundError as error:
        raise _not_found() from error
    except PlanningConflictError as error:
        raise _conflict(str(error)) from error
    return FixedEventResponse.model_validate(fixed_event)


@router.delete(
    "/days/{planning_day_id}/fixed-events/{fixed_event_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_fixed_event(
    planning_day_id: str,
    fixed_event_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> None:
    """Remove one fixed event owned through the planning day."""
    try:
        planning_service.delete_fixed_event(
            session, user.id, planning_day_id, fixed_event_id
        )
    except PlanningResourceNotFoundError as error:
        raise _not_found() from error


@router.post(
    "/tasks",
    response_model=TaskResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_task(
    request: TaskCreateRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> TaskResponse:
    """Create one flexible task for the authenticated user."""
    task = planning_service.create_task(session, user.id, request)
    return TaskResponse.model_validate(task)


@router.get("/tasks", response_model=list[TaskResponse])
def list_tasks(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[TaskResponse]:
    """List active flexible tasks for the authenticated user."""
    return [
        TaskResponse.model_validate(task)
        for task in planning_service.list_tasks(session, user.id)
    ]


@router.put("/tasks/{task_id}", response_model=TaskResponse)
def update_task(
    task_id: str,
    request: TaskUpdateRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> TaskResponse:
    """Replace editable settings for one active flexible task."""
    try:
        task = planning_service.update_task(session, user.id, task_id, request)
    except PlanningResourceNotFoundError as error:
        raise _not_found() from error
    return TaskResponse.model_validate(task)


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_task(
    task_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> None:
    """Soft-remove one active flexible task."""
    try:
        planning_service.remove_task(session, user.id, task_id)
    except PlanningResourceNotFoundError as error:
        raise _not_found() from error


@router.post(
    "/days/{planning_day_id}/task-progress",
    response_model=TaskProgressResponse,
    status_code=status.HTTP_201_CREATED,
)
def record_task_progress(
    planning_day_id: str,
    request: TaskProgressCreateRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> TaskProgressResponse:
    """Record immutable progress for a task owned by the current user."""
    try:
        progress = planning_service.record_task_progress(
            session, user.id, planning_day_id, request
        )
    except PlanningResourceNotFoundError as error:
        raise _not_found() from error
    except PlanningConflictError as error:
        raise _conflict(str(error)) from error
    return TaskProgressResponse.model_validate(progress)


@router.get(
    "/days/{planning_day_id}/task-progress",
    response_model=list[TaskProgressResponse],
)
def list_task_progress(
    planning_day_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[TaskProgressResponse]:
    """List immutable task progress records for a user-owned planning day."""
    try:
        progress_records = planning_service.list_task_progress(
            session, user.id, planning_day_id
        )
    except PlanningResourceNotFoundError as error:
        raise _not_found() from error
    return [
        TaskProgressResponse.model_validate(progress) for progress in progress_records
    ]


@router.post(
    "/days/{planning_day_id}/generate-plan",
    response_model=ScheduleSnapshotResponse,
    status_code=status.HTTP_201_CREATED,
)
def generate_plan(
    planning_day_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> ScheduleSnapshotResponse:
    """Generate and save an immutable schedule snapshot for a user-owned day."""
    try:
        snapshot = planning_service.generate_plan(
            session,
            user.id,
            planning_day_id,
            _get_scheduler_client(request),
            scheduler_version=settings.scheduler_version,
        )
    except PlanningResourceNotFoundError as error:
        raise _not_found() from error
    except SchedulerRejectedPlanningInputsError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Saved planning inputs could not be scheduled. Please review the day.",
        ) from error
    except SchedulerUnavailablePlanningError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The scheduler is unavailable. Please try again shortly.",
        ) from error
    return _snapshot_response(snapshot)


@router.post(
    "/days/{planning_day_id}/interruptions",
    response_model=ScheduleSnapshotResponse,
    status_code=status.HTTP_201_CREATED,
)
def report_interruption(
    planning_day_id: str,
    body: InterruptionCreateRequest,
    request: Request,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> ScheduleSnapshotResponse:
    """Record an interruption and synchronously save a revised schedule."""
    try:
        snapshot = planning_service.report_interruption_and_reschedule(
            session,
            user.id,
            planning_day_id,
            body,
            _get_scheduler_client(request),
            scheduler_version=settings.scheduler_version,
        )
    except PlanningResourceNotFoundError as error:
        raise _not_found() from error
    except SchedulerRejectedPlanningInputsError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Saved planning inputs could not be scheduled. Please review the day.",
        ) from error
    except SchedulerUnavailablePlanningError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The scheduler is unavailable. Please try again shortly.",
        ) from error
    return _snapshot_response(snapshot)


@router.get(
    "/days/{planning_day_id}/schedule",
    response_model=ScheduleSnapshotResponse,
)
def get_latest_schedule(
    planning_day_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> ScheduleSnapshotResponse:
    """Return the latest saved schedule snapshot for a user-owned day."""
    try:
        snapshot = planning_service.get_latest_schedule_snapshot(
            session, user.id, planning_day_id
        )
    except PlanningResourceNotFoundError as error:
        raise _not_found() from error
    return _snapshot_response(snapshot)


@router.get(
    "/days/{planning_day_id}/schedule-snapshots",
    response_model=list[ScheduleSnapshotSummaryResponse],
)
def list_schedule_snapshots(
    planning_day_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[ScheduleSnapshotSummaryResponse]:
    """List historical schedule snapshots for a user-owned day."""
    try:
        snapshots = planning_service.list_schedule_snapshots(
            session, user.id, planning_day_id
        )
    except PlanningResourceNotFoundError as error:
        raise _not_found() from error
    return [
        ScheduleSnapshotSummaryResponse(
            id=snapshot.id,
            planning_day_id=snapshot.planning_day_id,
            version=snapshot.version,
            created_at=snapshot.created_at,
            scheduler_version=snapshot.scheduler_version,
        )
        for snapshot in snapshots
    ]


@router.get(
    "/schedule-snapshots/{snapshot_id}",
    response_model=ScheduleSnapshotResponse,
)
def get_schedule_snapshot(
    snapshot_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> ScheduleSnapshotResponse:
    """Return one historical schedule snapshot owned by the authenticated user."""
    try:
        snapshot = planning_service.get_schedule_snapshot(session, user.id, snapshot_id)
    except PlanningResourceNotFoundError as error:
        raise _not_found() from error
    return _snapshot_response(snapshot)


def _not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Planning resource not found.",
    )


def _conflict(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)


def _get_scheduler_client(request: Request) -> SchedulerClient:
    return request.app.state.scheduler_client


def _snapshot_response(snapshot: object) -> ScheduleSnapshotResponse:
    time_zone = ZoneInfo(snapshot.planning_day.time_zone)
    return ScheduleSnapshotResponse(
        id=snapshot.id,
        planning_day_id=snapshot.planning_day_id,
        version=snapshot.version,
        created_at=snapshot.created_at,
        scheduler_version=snapshot.scheduler_version,
        configuration=snapshot.configuration_json,
        items=[
            ScheduleItemResponse(
                id=item.id,
                kind=item.kind,
                task_id=item.task_id,
                fixed_event_id=item.fixed_event_id,
                interruption_id=item.interruption_id,
                start_at=_as_utc(item.start_at).astimezone(time_zone),
                end_at=_as_utc(item.end_at).astimezone(time_zone),
            )
            for item in snapshot.items
        ],
        decisions=[
            ScheduleDecisionResponse(
                id=decision.id,
                task_id=decision.task_id,
                reason_code=decision.reason_code,
                details=decision.details_json,
            )
            for decision in snapshot.decisions
        ],
    )


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)
