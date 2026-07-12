"""FastAPI routes for authenticated planning input persistence."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from api_service.application.planning import (
    PlanningConflictError,
    PlanningResourceNotFoundError,
    PlanningService,
    PlanningValidationError,
    SchedulerRejectedPlanningInputsError,
    SchedulerUnavailablePlanningError,
)
from api_service.config import Settings
from api_service.contracts.planning import (
    FreeTimeRangeResponse,
    FixedEventCreateRequest,
    FixedEventResponse,
    FixedEventUpdateRequest,
    InterruptionCreateRequest,
    ParseInterruptionRequest,
    ParseInterruptionResponse,
    ParseTaskRequest,
    ParseTaskResponse,
    PlanningDayCreateRequest,
    PlanningDayResponse,
    PlanningRangeSummaryResponse,
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
from api_service.infrastructure.ai_client import AiClient
from api_service.infrastructure.scheduler_client import SchedulerClient
from api_service.interfaces.auth import get_current_user, get_session, get_settings


router = APIRouter(prefix="/planning", tags=["planning"])
planning_service = PlanningService()


@router.post("/ai/parse-task", response_model=ParseTaskResponse)
def parse_task(
    body: ParseTaskRequest,
    request: Request,
    user: User = Depends(get_current_user),
) -> ParseTaskResponse:
    """Return an editable task parsing proposal without persisting it."""
    _ = user
    result = _get_ai_client(request).parse_task(body.model_dump(mode="json"))
    return ParseTaskResponse.model_validate(result.model_dump())


@router.post("/ai/parse-interruption", response_model=ParseInterruptionResponse)
def parse_interruption(
    body: ParseInterruptionRequest,
    request: Request,
    user: User = Depends(get_current_user),
) -> ParseInterruptionResponse:
    """Return an editable interruption proposal without persisting it."""
    _ = user
    result = _get_ai_client(request).parse_interruption(body.model_dump(mode="json"))
    return ParseInterruptionResponse.model_validate(result.model_dump())


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


@router.get("/overviews/week", response_model=PlanningRangeSummaryResponse)
def get_week_overview(
    start_date: date = Query(
        ..., description="First local date in the seven-day overview."
    ),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> PlanningRangeSummaryResponse:
    """Return a seven-day saved-plan summary for the authenticated user."""
    return planning_service.summarize_planning_range(
        session,
        user.id,
        start_date,
        start_date + timedelta(days=6),
    )


@router.get("/overviews/month", response_model=PlanningRangeSummaryResponse)
def get_month_overview(
    month: date = Query(
        ...,
        description="Any date in the local month to summarize; use YYYY-MM-01.",
    ),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> PlanningRangeSummaryResponse:
    """Return a calendar-month saved-plan summary for the authenticated user."""
    start_date = month.replace(day=1)
    if start_date.month == 12:
        next_month = start_date.replace(year=start_date.year + 1, month=1)
    else:
        next_month = start_date.replace(month=start_date.month + 1)
    return planning_service.summarize_planning_range(
        session,
        user.id,
        start_date,
        next_month - timedelta(days=1),
    )


@router.get("/free-times", response_model=FreeTimeRangeResponse)
def find_free_times(
    start_date: str = Query(
        ...,
        pattern=r"^\d{4}-\d{2}-\d{2}$",
        description="First local date in the inclusive free-time search range.",
    ),
    end_date: str = Query(
        ...,
        pattern=r"^\d{4}-\d{2}-\d{2}$",
        description="Last local date in the inclusive free-time search range.",
    ),
    minimum_minutes: int = Query(
        30,
        ge=1,
        le=1440,
        description="Minimum useful free-time window duration in minutes.",
    ),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> FreeTimeRangeResponse:
    """Find persisted designated free-time windows in current daily snapshots."""
    parsed_start_date = _date_only_query(start_date, "start_date")
    parsed_end_date = _date_only_query(end_date, "end_date")
    if parsed_start_date > parsed_end_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="start_date must be on or before end_date.",
        )
    if (parsed_end_date - parsed_start_date).days > 30:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Free-time search range cannot exceed 31 days.",
        )
    return planning_service.find_free_times(
        session,
        user.id,
        parsed_start_date,
        parsed_end_date,
        minimum_minutes,
    )


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
    except PlanningConflictError as error:
        raise _conflict(str(error)) from error
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
    except PlanningValidationError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(error),
        ) from error
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


def _get_ai_client(request: Request) -> AiClient:
    return request.app.state.ai_client


def _date_only_query(value: str, field_name: str) -> date:
    try:
        parsed = date.fromisoformat(value)
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{field_name} must be a valid date.",
        ) from error
    if parsed.isoformat() != value:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{field_name} must be a date without a time.",
        )
    return parsed


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
