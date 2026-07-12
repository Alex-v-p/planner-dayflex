"""Safe structured logging for the AI service."""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime


LOGGER_NAME = "ai_service"
SAFE_EVENTS = frozenset({"ai_started", "parse_completed", "explanation_completed"})
DEFAULT_EVENT = "log_event"
UVICORN_LOGGER_NAMES = ("uvicorn.error", "uvicorn.access")


class JsonFormatter(logging.Formatter):
    """Emit allowlisted operational metadata only."""

    def format(self, record: logging.LogRecord) -> str:
        event = getattr(record, "event", DEFAULT_EVENT)
        if not isinstance(event, str) or event not in SAFE_EVENTS:
            event = DEFAULT_EVENT
        payload = {
            "timestamp": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "event": event,
        }
        return json.dumps(payload, separators=(",", ":"), sort_keys=True)


def _configure_safe_logger(logger: logging.Logger, log_level: str) -> None:
    logger.handlers.clear()
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    logger.addHandler(handler)
    logger.setLevel(log_level)
    logger.propagate = False
    logger.disabled = False


def configure_logging(log_level: str) -> logging.Logger:
    """Configure service logs without prompts, provider data, URLs, or secrets."""
    service_logger = logging.getLogger(LOGGER_NAME)
    _configure_safe_logger(service_logger, log_level)
    for logger_name in UVICORN_LOGGER_NAMES:
        _configure_safe_logger(logging.getLogger(logger_name), log_level)
    return service_logger
