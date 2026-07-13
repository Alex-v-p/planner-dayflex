"""FastAPI application factory for the browser-facing application boundary."""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from .config import Settings
from .correlation import REQUEST_ID_HEADER, generate_request_id, set_request_id
from .database import Database
from .infrastructure.ai_client import AiClient, DisabledAiClient, HttpAiClient
from .infrastructure.scheduler_client import HttpSchedulerClient, SchedulerClient
from .infrastructure.worker_queue import (
    DisabledWorkerQueueClient,
    RqWorkerQueueClient,
    WorkerQueueClient,
)
from .interfaces.auth import router as auth_router
from .interfaces.planning import router as planning_router
from .logging_config import configure_logging


class HealthResponse(BaseModel):
    """Dependency-free liveness response for the API process."""

    status: str = "ok"


class ReadinessCheck(BaseModel):
    """One safe readiness signal without connection strings or secrets."""

    name: str
    status: str


class ReadinessResponse(BaseModel):
    """Aggregated readiness response for the API process and dependencies."""

    status: str
    checks: list[ReadinessCheck]


def redact_validation_error_inputs(error: dict[str, object]) -> dict[str, object]:
    """Remove raw request input from validation errors while keeping safe details."""
    redacted_error = dict(error)
    redacted_error.pop("input", None)
    return redacted_error


def create_app(
    settings: Settings | None = None,
    database: Database | None = None,
    scheduler_client: SchedulerClient | None = None,
    ai_client: AiClient | None = None,
    worker_queue_client: WorkerQueueClient | None = None,
) -> FastAPI:
    """Build an API instance from explicit settings and its owned database boundary."""
    configured_settings = settings or Settings()
    logger = configure_logging(configured_settings.log_level)
    configured_database = database or Database.from_settings(configured_settings)
    configured_scheduler_client = scheduler_client or HttpSchedulerClient(
        str(configured_settings.scheduler_base_url)
    )
    if ai_client is not None:
        configured_ai_client = ai_client
    elif configured_settings.ai_service_base_url is None:
        configured_ai_client = DisabledAiClient()
    else:
        configured_ai_client = HttpAiClient(
            str(configured_settings.ai_service_base_url),
            timeout_seconds=configured_settings.ai_client_timeout_seconds,
        )
    if worker_queue_client is not None:
        configured_worker_queue_client = worker_queue_client
    elif configured_settings.worker_redis_url_value is None:
        configured_worker_queue_client = DisabledWorkerQueueClient()
    else:
        configured_worker_queue_client = RqWorkerQueueClient(
            configured_settings.worker_redis_url_value
        )

    app = FastAPI(
        title="planner-dayflex application API",
        version="0.1.0",
        description=(
            "Application boundary for future validation, authorization, persistence, "
            "and scheduler orchestration."
        ),
    )
    app.state.settings = configured_settings
    app.state.database = configured_database
    app.state.scheduler_client = configured_scheduler_client
    app.state.ai_client = configured_ai_client
    app.state.worker_queue_client = configured_worker_queue_client

    @app.middleware("http")
    async def correlate_request(request: Request, call_next):
        """Attach a service-owned request ID to logs and responses."""
        request_id = generate_request_id()
        set_request_id(request_id)
        try:
            response = await call_next(request)
            response.headers[REQUEST_ID_HEADER] = request_id
            logger.info(
                "API request completed",
                extra={"event": "request_completed"},
            )
            return response
        finally:
            set_request_id(None)

    @app.exception_handler(RequestValidationError)
    def request_validation_exception_handler(
        _request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        """Return validation details without echoing password field inputs."""
        return JSONResponse(
            status_code=422,
            content=jsonable_encoder(
                {
                    "detail": [
                        redact_validation_error_inputs(error) for error in exc.errors()
                    ]
                }
            ),
        )

    @app.get("/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        """Report process liveness without conflating it with database readiness."""
        return HealthResponse()

    @app.get("/ready", response_model=ReadinessResponse)
    def ready() -> JSONResponse | ReadinessResponse:
        """Check API dependencies with safe service/check names only."""
        checks: list[ReadinessCheck] = []
        try:
            configured_database.check_connection()
            checks.append(ReadinessCheck(name="database", status="ok"))
        except Exception:
            logging.getLogger("api_service").warning(
                "Readiness check failed",
                extra={"event": "readiness_check_completed"},
            )
            checks.append(ReadinessCheck(name="database", status="unavailable"))

        try:
            scheduler_ready = configured_scheduler_client.check_readiness()
        except Exception:
            logging.getLogger("api_service").warning(
                "Readiness check failed",
                extra={"event": "readiness_check_completed"},
            )
            scheduler_ready = False
        checks.append(
            ReadinessCheck(
                name="scheduler",
                status="ok" if scheduler_ready else "unavailable",
            )
        )
        status_code = 200 if all(check.status == "ok" for check in checks) else 503
        body = ReadinessResponse(
            status="ok" if status_code == 200 else "unavailable",
            checks=checks,
        )
        if status_code == 200:
            return body
        return JSONResponse(status_code=status_code, content=body.model_dump())

    app.include_router(auth_router)
    app.include_router(planning_router)

    logger.info("API application created", extra={"event": "api_started"})
    return app
