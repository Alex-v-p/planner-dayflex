"""Safe, structured logging for the API service."""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime


LOGGER_NAME = "api_service"
UVICORN_LOGGER_NAMES = ("uvicorn.error", "uvicorn.access")
DEFAULT_EVENT = "log_event"
SAFE_EVENTS = frozenset({"api_started", "worker_queue_unavailable"})


class JsonFormatter(logging.Formatter):
    """Emit a small allowlisted JSON event without request or secret values."""

    def format(self, record: logging.LogRecord) -> str:
        """Serialize only operational metadata controlled by this service."""
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
    """Replace a runtime logger's handlers with the safe structured formatter."""
    logger.handlers.clear()
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    logger.addHandler(handler)
    logger.setLevel(log_level)
    logger.propagate = False
    logger.disabled = False


def configure_logging(log_level: str) -> logging.Logger:
    """Configure API and Uvicorn logs without request, setting, or secret values."""
    service_logger = logging.getLogger(LOGGER_NAME)
    _configure_safe_logger(service_logger, log_level)
    for logger_name in UVICORN_LOGGER_NAMES:
        _configure_safe_logger(logging.getLogger(logger_name), log_level)
    return service_logger
