"""Safe structured logging for the worker service."""

from __future__ import annotations

from datetime import UTC, datetime
import json
import logging

from worker_service.correlation import current_request_id


LOGGER_NAME = "worker_service"
SAFE_EVENTS = frozenset(
    {
        "worker_started",
        "worker_job_completed",
        "worker_job_duplicate",
        "worker_job_retryable_failed",
        "worker_job_permanent_failed",
        "worker_cleanup_completed",
    }
)
DEFAULT_EVENT = "log_event"


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
        request_id = current_request_id()
        if request_id is not None:
            payload["request_id"] = request_id
        return json.dumps(payload, separators=(",", ":"), sort_keys=True)


def configure_logging(log_level: str) -> logging.Logger:
    """Configure worker logs without payloads, URLs, credentials, or prompts."""
    logger = logging.getLogger(LOGGER_NAME)
    logger.handlers.clear()
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    logger.addHandler(handler)
    logger.setLevel(log_level)
    logger.propagate = False
    logger.disabled = False
    return logger
