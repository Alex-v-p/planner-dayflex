"""Account and session domain rules."""

from __future__ import annotations

import re
from dataclasses import dataclass


USERNAME_PATTERN = re.compile(r"^[a-z0-9_-]{3,32}$")
PASSWORD_MIN_LENGTH = 12
PASSWORD_MAX_LENGTH = 128
SESSION_COOKIE_NAME = "planner_session"
SESSION_TTL_DAYS = 7


class InvalidUsernameError(ValueError):
    """Raised when a username cannot identify an account."""


class InvalidPasswordError(ValueError):
    """Raised when a password cannot be accepted for storage."""


@dataclass(frozen=True)
class NormalizedUsername:
    """A display username and the normalized lookup key."""

    display: str
    normalized: str


def normalize_username(username: str) -> NormalizedUsername:
    """Trim and lowercase a username, then enforce the documented format."""
    display = username.strip()
    normalized = display.lower()
    if not USERNAME_PATTERN.fullmatch(normalized):
        raise InvalidUsernameError(
            "Username must be 3-32 lowercase ASCII letters, digits, '_' or '-'."
        )
    return NormalizedUsername(display=normalized, normalized=normalized)


def validate_password(password: str) -> None:
    """Accept passphrase-length passwords without arbitrary composition rules."""
    if not PASSWORD_MIN_LENGTH <= len(password) <= PASSWORD_MAX_LENGTH:
        raise InvalidPasswordError("Password must be 12-128 characters.")
