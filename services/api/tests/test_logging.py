"""Tests for the safe structured-log format."""

from __future__ import annotations

import json
import logging

from api_service.logging_config import JsonFormatter


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

    formatted = JsonFormatter().format(record)

    assert json.loads(formatted)["event"] == "api_started"
    assert "database_url" not in formatted
    assert "password" not in formatted
