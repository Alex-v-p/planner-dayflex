"""ASGI application for the optional AI parsing service."""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from ai_service.application.explanations import ExplanationApplication
from ai_service.application.parsing import ParseApplication
from ai_service.correlation import REQUEST_ID_HEADER, safe_request_id, set_request_id
from ai_service.contracts.explanations import (
    ExplainScheduleDecisionRequestDTO,
    ExplainScheduleDecisionResultDTO,
)
from ai_service.contracts.parsing import (
    HealthResponseDTO,
    ParseInterruptionRequestDTO,
    ParseInterruptionResultDTO,
    ParseTaskRequestDTO,
    ParseTaskResultDTO,
    ValidationErrorResponseDTO,
)
from ai_service.infrastructure.config import Settings
from ai_service.infrastructure.logging_config import configure_logging
from ai_service.infrastructure.providers import provider_from_settings


def _validation_error_response() -> JSONResponse:
    """Build the deliberately generic public validation envelope."""
    return JSONResponse(
        status_code=422,
        content=ValidationErrorResponseDTO().model_dump(mode="json"),
    )


def create_app(settings: Settings | None = None) -> FastAPI:
    """Build the AI service app from explicit settings."""
    configured_settings = settings or Settings()
    logger = configure_logging(configured_settings.log_level)
    provider = provider_from_settings(configured_settings)
    parser = ParseApplication(provider)
    explainer = ExplanationApplication(provider)

    app = FastAPI(
        title="planner-dayflex AI service",
        version="0.1.0",
        description="Optional natural-language parsing boundary.",
    )
    app.state.settings = configured_settings
    app.state.parser = parser
    app.state.explainer = explainer

    @app.middleware("http")
    async def correlate_request(request: Request, call_next):
        """Attach a safe request ID to logs and responses."""
        request_id = safe_request_id(request.headers.get(REQUEST_ID_HEADER))
        set_request_id(request_id)
        try:
            response = await call_next(request)
            response.headers[REQUEST_ID_HEADER] = request_id
            logger.info("AI request completed", extra={"event": "request_completed"})
            return response
        finally:
            set_request_id(None)

    @app.exception_handler(RequestValidationError)
    async def request_validation_error_handler(
        _: Request, __: RequestValidationError
    ) -> JSONResponse:
        """Prevent framework validation details from reflecting user text."""
        return _validation_error_response()

    @app.get("/health", response_model=HealthResponseDTO)
    def health() -> HealthResponseDTO:
        """Report process liveness without checking provider readiness."""
        return HealthResponseDTO()

    @app.get("/ready", response_model=HealthResponseDTO)
    def ready() -> HealthResponseDTO:
        """Report AI service readiness without exposing provider configuration."""
        return HealthResponseDTO()

    @app.post(
        "/v1/parse-task",
        response_model=ParseTaskResultDTO,
        responses={422: {"model": ValidationErrorResponseDTO}},
    )
    def parse_task(request: ParseTaskRequestDTO) -> ParseTaskResultDTO:
        """Return an editable task proposal or explicit fallback."""
        result = parser.parse_task(request)
        logger.info("AI parse completed", extra={"event": "parse_completed"})
        return result

    @app.post(
        "/v1/parse-interruption",
        response_model=ParseInterruptionResultDTO,
        responses={422: {"model": ValidationErrorResponseDTO}},
    )
    def parse_interruption(
        request: ParseInterruptionRequestDTO,
    ) -> ParseInterruptionResultDTO:
        """Return an editable interruption proposal or explicit fallback."""
        result = parser.parse_interruption(request)
        logger.info("AI parse completed", extra={"event": "parse_completed"})
        return result

    @app.post(
        "/v1/explain-schedule-decision",
        response_model=ExplainScheduleDecisionResultDTO,
        responses={422: {"model": ValidationErrorResponseDTO}},
    )
    def explain_schedule_decision(
        request: ExplainScheduleDecisionRequestDTO,
    ) -> ExplainScheduleDecisionResultDTO:
        """Return optional decision wording or explicit fallback."""
        result = explainer.explain_schedule_decision(request)
        logger.info(
            "AI explanation completed", extra={"event": "explanation_completed"}
        )
        return result

    logger.info("AI application created", extra={"event": "ai_started"})
    return app


app = create_app()
