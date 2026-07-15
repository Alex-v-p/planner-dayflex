"""ASGI application exposing the scheduler core through a narrow HTTP contract."""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from scheduler_core import SchedulerValidationError, reschedule, schedule

from .correlation import REQUEST_ID_HEADER, safe_request_id, set_request_id
from .contracts import (
    HealthResponseDTO,
    RescheduleRequestDTO,
    ScheduleRequestDTO,
    ScheduleResultDTO,
    ValidationErrorResponseDTO,
)
from .logging_config import configure_logging


logger = configure_logging()


app = FastAPI(
    title="planner-dayflex scheduler service",
    version="0.1.0",
    description="Thin deterministic scheduler transport boundary without persistence.",
)


@app.middleware("http")
async def correlate_request(request: Request, call_next):
    """Attach a safe request ID to logs and responses."""
    request_id = safe_request_id(request.headers.get(REQUEST_ID_HEADER))
    set_request_id(request_id)
    try:
        response = await call_next(request)
        response.headers[REQUEST_ID_HEADER] = request_id
        logger.info("Scheduler request completed", extra={"event": "request_completed"})
        return response
    finally:
        set_request_id(None)


class SchedulerRequestError(Exception):
    """Signals a core validation error that is safe to expose as HTTP 422."""


def _validation_error_response() -> JSONResponse:
    """Build the deliberately generic public validation envelope."""
    return JSONResponse(
        status_code=422,
        content=ValidationErrorResponseDTO().model_dump(mode="json"),
    )


@app.exception_handler(RequestValidationError)
async def request_validation_error_handler(
    _: Request, __: RequestValidationError
) -> JSONResponse:
    """Prevent framework validation details from reflecting input or internals."""
    return _validation_error_response()


@app.exception_handler(SchedulerRequestError)
async def scheduler_validation_error_handler(
    _: Request, __: SchedulerRequestError
) -> JSONResponse:
    """Translate core contract failures into the same safe public 422 envelope."""
    return _validation_error_response()


@app.get("/health", response_model=HealthResponseDTO)
def health() -> HealthResponseDTO:
    """Return a liveness response without checking deferred infrastructure."""
    return HealthResponseDTO()


@app.get("/ready", response_model=HealthResponseDTO)
def ready() -> HealthResponseDTO:
    """Report readiness for the dependency-free scheduler process."""
    return HealthResponseDTO()


@app.post(
    "/v1/schedule-day",
    response_model=ScheduleResultDTO,
    responses={422: {"model": ValidationErrorResponseDTO}},
)
def schedule_day(request: ScheduleRequestDTO) -> ScheduleResultDTO:
    """Schedule one day by delegating the decision entirely to scheduler-core."""
    try:
        return ScheduleResultDTO.from_core(schedule(request.to_core()))
    except SchedulerValidationError as error:
        raise SchedulerRequestError() from error


@app.post(
    "/v1/reschedule-day",
    response_model=ScheduleResultDTO,
    responses={422: {"model": ValidationErrorResponseDTO}},
)
def reschedule_day(request: RescheduleRequestDTO) -> ScheduleResultDTO:
    """Replan unfinished work by delegating recovery decisions to scheduler-core."""
    try:
        return ScheduleResultDTO.from_core(
            reschedule(
                request.previous_result_to_core(), request.schedule_request.to_core()
            )
        )
    except SchedulerValidationError as error:
        raise SchedulerRequestError() from error
