"""FastAPI routes for authenticated planning input persistence."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from api_service.application.planning import (
    PlanningConflictError,
    PlanningResourceNotFoundError,
    PlanningService,
)
from api_service.contracts.planning import (
    FixedEventCreateRequest,
    FixedEventResponse,
    FixedEventUpdateRequest,
    PlanningDayCreateRequest,
    PlanningDayResponse,
    TaskCreateRequest,
    TaskResponse,
    TaskUpdateRequest,
    UserPreferencesRequest,
    UserPreferencesResponse,
)
from api_service.infrastructure.models import User
from api_service.interfaces.auth import get_current_user, get_session


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


def _not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Planning resource not found.",
    )


def _conflict(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)
