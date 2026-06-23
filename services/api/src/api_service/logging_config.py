"""Safe, structured logging for the API service."""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime


LOGGER_NAME = "api_service"


class JsonFormatter(logging.Formatter):
    """Emit a small allowlisted JSON event without request or secret values."""

    def format(self, record: logging.LogRecord) -> str:
        """Serialize only operational metadata controlled by this service."""
        payload = {
            "timestamp": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "event": getattr(record, "event", "log_event"),
        }
        return json.dumps(payload, separators=(",", ":"), sort_keys=True)


def configure_logging(log_level: str) -> logging.Logger:
    """Configure the service logger without recording settings or request bodies."""
    logger = logging.getLogger(LOGGER_NAME)
    logger.handlers.clear()
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    logger.addHandler(handler)
    logger.setLevel(log_level)
    logger.propagate = False
    return logger
