"""Tests for the safe structured-log format."""

from __future__ import annotations

import json
import logging

from api_service.app import create_app
from api_service.config import Settings
from api_service.correlation import set_request_id
from api_service.logging_config import (
    LOGGER_NAME,
    UVICORN_LOGGER_NAMES,
    JsonFormatter,
)


def test_json_formatter_does_not_include_message_or_sensitive_extra_values() -> None:
    """Application logs stay useful without emitting configuration or credentials."""
    record = logging.LogRecord(
        name="api_service",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="database_url=postgresql+psycopg://user:password@example.test/db",
        args=(),
        exc_info=None,
    )
    record.event = "api_started"
    record.password = "password"

    set_request_id("req-safe-123")
    formatted = JsonFormatter().format(record)

    payload = json.loads(formatted)
    assert payload["event"] == "api_started"
    assert payload["request_id"] == "req-safe-123"
    assert "database_url" not in formatted
    assert "password" not in formatted


def test_json_formatter_replaces_an_untrusted_event_value() -> None:
    """An arbitrary event field cannot become another path for sensitive output."""
    record = logging.LogRecord(
        name="api_service",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="ignored",
        args=(),
        exc_info=None,
    )
    record.event = "password=secret"

    formatted = JsonFormatter().format(record)

    assert json.loads(formatted)["event"] == "log_event"
    assert "password" not in formatted
    assert "secret" not in formatted


def test_application_factory_replaces_uvicorn_access_handlers_with_safe_json(
    settings: Settings,
) -> None:
    """Uvicorn access/error loggers cannot render a request target or query string."""
    create_app(settings)

    for logger_name in (LOGGER_NAME, *UVICORN_LOGGER_NAMES):
        logger = logging.getLogger(logger_name)
        assert logger.propagate is False
        assert logger.disabled is False
        assert len(logger.handlers) == 1
        assert isinstance(logger.handlers[0].formatter, JsonFormatter)

    access_record = logging.LogRecord(
        name="uvicorn.access",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg='%s - "%s %s HTTP/%s" %d',
        args=("127.0.0.1", "GET", "/health?password=secret", "1.1", 200),
        exc_info=None,
    )
    formatted = logging.getLogger("uvicorn.access").handlers[0].format(access_record)

    assert json.loads(formatted)["event"] == "log_event"
    assert "/health" not in formatted
    assert "password" not in formatted
    assert "secret" not in formatted
