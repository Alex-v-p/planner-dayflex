"""Request correlation helpers with a deliberately small safe surface."""

from __future__ import annotations

from contextvars import ContextVar
import re
from uuid import uuid4


REQUEST_ID_HEADER = "X-Request-ID"
REQUEST_ID_PATTERN = r"^pdreq\.[0-9a-f]{32}$"
_REQUEST_ID_PATTERN = re.compile(REQUEST_ID_PATTERN)
_request_id: ContextVar[str | None] = ContextVar("request_id", default=None)


def generate_request_id() -> str:
    """Generate a service-owned canonical request ID."""
    return f"pdreq.{uuid4().hex}"


def safe_request_id(value: str | None) -> str:
    """Return a canonical service-owned ID or generate a replacement."""
    if value is not None:
        stripped = value.strip()
        if _REQUEST_ID_PATTERN.fullmatch(stripped):
            return stripped
    return generate_request_id()


def set_request_id(value: str | None) -> None:
    """Store or clear the safe request ID for the current execution context."""
    _request_id.set(None if value is None else safe_request_id(value))


def current_request_id() -> str | None:
    """Return the current safe request ID when one has been established."""
    return _request_id.get()
