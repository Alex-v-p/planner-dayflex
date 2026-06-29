"""FastAPI application factory for the browser-facing application boundary."""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from .config import Settings
from .database import Database
from .interfaces.auth import router as auth_router
from .logging_config import configure_logging


class HealthResponse(BaseModel):
    """Dependency-free liveness response for the API process."""

    status: str = "ok"


def redact_validation_error_inputs(error: dict[str, object]) -> dict[str, object]:
    """Remove raw sensitive input from validation errors while keeping safe details."""
    redacted_error = dict(error)
    location = redacted_error.get("loc")
    if isinstance(location, tuple | list) and any(
        str(part).lower() == "password" for part in location
    ):
        redacted_error.pop("input", None)
    return redacted_error


def create_app(
    settings: Settings | None = None,
    database: Database | None = None,
) -> FastAPI:
    """Build an API instance from explicit settings and its owned database boundary."""
    configured_settings = settings or Settings()
    logger = configure_logging(configured_settings.log_level)
    configured_database = database or Database.from_settings(configured_settings)

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

    app.include_router(auth_router)

    logger.info("API application created", extra={"event": "api_started"})
    return app
