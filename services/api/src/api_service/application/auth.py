"""Authentication use cases."""

from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from api_service.domain.auth import (
    SESSION_TTL_DAYS,
    InvalidPasswordError,
    InvalidUsernameError,
    normalize_username,
    validate_password,
)
from api_service.infrastructure.models import AuthSession, User


class RegistrationError(Exception):
    """Raised when a requested account cannot be created."""


class AuthenticationFailedError(Exception):
    """Raised for indistinguishable login failures."""


class SessionNotFoundError(Exception):
    """Raised when a session token does not identify an active session."""


@dataclass(frozen=True)
class CreatedSession:
    """A newly issued session and the user it authenticates."""

    user: User
    token: str
    expires_at: datetime


class AuthService:
    """Coordinate account credentials and revocable sessions."""

    def __init__(self, password_hasher: PasswordHasher | None = None) -> None:
        self._password_hasher = password_hasher or PasswordHasher()

    def register(
        self, session: Session, username: str, password: str
    ) -> CreatedSession:
        """Create an account and immediately sign it in."""
        try:
            normalized_username = normalize_username(username)
            validate_password(password)
        except (InvalidUsernameError, InvalidPasswordError) as error:
            raise RegistrationError(str(error)) from error

        now = _utc_now()
        user = User(
            id=str(uuid4()),
            username=normalized_username.display,
            username_normalized=normalized_username.normalized,
            password_hash=self._password_hasher.hash(password),
            created_at=now,
        )
        session.add(user)
        try:
            issued_session = self._create_session(session, user, now)
            session.commit()
        except IntegrityError as error:
            session.rollback()
            raise RegistrationError("Username is already in use.") from error
        return issued_session

    def login(self, session: Session, username: str, password: str) -> CreatedSession:
        """Verify credentials and issue a new session."""
        try:
            normalized_username = normalize_username(username)
        except InvalidUsernameError as error:
            raise AuthenticationFailedError("Invalid username or password.") from error

        user = session.scalar(
            select(User).where(
                User.username_normalized == normalized_username.normalized
            )
        )
        if user is None:
            raise AuthenticationFailedError("Invalid username or password.")
        try:
            self._password_hasher.verify(user.password_hash, password)
        except VerifyMismatchError as error:
            raise AuthenticationFailedError("Invalid username or password.") from error

        issued_session = self._create_session(session, user, _utc_now())
        session.commit()
        return issued_session

    def get_user_for_token(self, session: Session, token: str | None) -> User:
        """Resolve an active, unexpired session token into a user identity."""
        if not token:
            raise SessionNotFoundError
        token_hash = hash_session_token(token)
        auth_session = session.scalar(
            select(AuthSession).where(AuthSession.token_hash == token_hash)
        )
        now = _utc_now()
        if (
            auth_session is None
            or auth_session.revoked_at is not None
            or _as_utc(auth_session.expires_at) <= now
        ):
            raise SessionNotFoundError
        return auth_session.user

    def logout(self, session: Session, token: str | None) -> None:
        """Revoke the current session when it exists."""
        if not token:
            return
        auth_session = session.scalar(
            select(AuthSession).where(
                AuthSession.token_hash == hash_session_token(token)
            )
        )
        if auth_session is None or auth_session.revoked_at is not None:
            return
        auth_session.revoked_at = _utc_now()
        session.commit()

    def revoke_user_sessions_after_password_change(
        self, session: Session, user_id: str
    ) -> None:
        """Mark password change time and revoke all active sessions for a user."""
        now = _utc_now()
        user = session.get(User, user_id)
        if user is None:
            raise SessionNotFoundError
        user.password_changed_at = now
        for auth_session in session.scalars(
            select(AuthSession).where(
                AuthSession.user_id == user_id,
                AuthSession.revoked_at.is_(None),
            )
        ):
            auth_session.revoked_at = now
        session.commit()

    def _create_session(
        self, session: Session, user: User, now: datetime
    ) -> CreatedSession:
        token = secrets.token_urlsafe(32)
        expires_at = now + timedelta(days=SESSION_TTL_DAYS)
        auth_session = AuthSession(
            id=str(uuid4()),
            user_id=user.id,
            token_hash=hash_session_token(token),
            expires_at=expires_at,
            created_at=now,
        )
        session.add(auth_session)
        return CreatedSession(user=user, token=token, expires_at=expires_at)


def hash_session_token(token: str) -> str:
    """Hash an opaque session token for storage and lookup."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)
