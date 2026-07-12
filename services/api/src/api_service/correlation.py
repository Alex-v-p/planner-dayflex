"""Request correlation helpers with a deliberately small safe surface."""

from __future__ import annotations

from contextvars import ContextVar
import re
from uuid import uuid4


REQUEST_ID_HEADER = "X-Request-ID"
_REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]{8,80}$")
_request_id: ContextVar[str | None] = ContextVar("request_id", default=None)


def safe_request_id(value: str | None) -> str:
    """Return a caller-supplied safe ID or generate an opaque replacement."""
    if value is not None:
        stripped = value.strip()
        if _REQUEST_ID_PATTERN.fullmatch(stripped):
            return stripped
    return uuid4().hex


def set_request_id(value: str | None) -> None:
    """Store or clear the safe request ID for the current execution context."""
    _request_id.set(value)


def current_request_id() -> str | None:
    """Return the current safe request ID when one has been established."""
    return _request_id.get()
