"""FastAPI routes and dependencies for username/password authentication."""

from __future__ import annotations

from collections import defaultdict, deque
from collections.abc import Generator
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from api_service.application.auth import (
    AuthService,
    AuthenticationFailedError,
    CreatedSession,
    RegistrationError,
    SessionNotFoundError,
)
from api_service.config import Environment, Settings
from api_service.contracts.auth import (
    AuthCredentialsRequest,
    AuthenticatedUserResponse,
    UserResponse,
)
from api_service.database import Database
from api_service.domain.auth import SESSION_COOKIE_NAME, normalize_username
from api_service.infrastructure.models import User


router = APIRouter(prefix="/auth", tags=["auth"])
auth_service = AuthService()


@dataclass
class InProcessAuthRateLimiter:
    """Small single-process limiter for failed auth attempts."""

    max_failures: int = 5
    window: timedelta = timedelta(minutes=5)
    _failures: dict[str, deque[datetime]] = field(
        default_factory=lambda: defaultdict(deque)
    )

    def check(self, key: str) -> None:
        """Reject requests after too many recent failures for a key."""
        failures = self._pruned_failures(key)
        if len(failures) >= self.max_failures:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many authentication attempts. Please try again later.",
            )

    def record_failure(self, key: str) -> None:
        """Record one failed attempt."""
        failures = self._pruned_failures(key)
        if not failures:
            self._failures[key] = failures
        failures.append(_utc_now())

    def record_success(self, key: str) -> None:
        """Clear failures after a successful attempt."""
        self._failures.pop(key, None)

    def _pruned_failures(self, key: str) -> deque[datetime]:
        failures = self._failures.get(key, deque())
        cutoff = _utc_now() - self.window
        while failures and failures[0] <= cutoff:
            failures.popleft()
        if not failures:
            self._failures.pop(key, None)
        return failures


rate_limiter = InProcessAuthRateLimiter()


def get_database(request: Request) -> Database:
    """Return the configured database boundary."""
    return request.app.state.database


def get_settings(request: Request) -> Settings:
    """Return explicit application settings."""
    return request.app.state.settings


def get_session(database: Database = Depends(get_database)) -> Generator[Session]:
    """Open one database unit of work for an API request."""
    yield from database.session()


def get_current_user(
    request: Request,
    session: Session = Depends(get_session),
) -> User:
    """Resolve the authenticated user for protected routes."""
    try:
        return auth_service.get_user_for_token(
            session, request.cookies.get(SESSION_COOKIE_NAME)
        )
    except SessionNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        ) from error


@router.post(
    "/register",
    response_model=AuthenticatedUserResponse,
    status_code=status.HTTP_201_CREATED,
)
def register(
    credentials: AuthCredentialsRequest,
    request: Request,
    response: Response,
    settings: Settings = Depends(get_settings),
    session: Session = Depends(get_session),
) -> AuthenticatedUserResponse:
    """Create an account and signed-in session."""
    key = _rate_limit_key(request, "register", credentials.username)
    rate_limiter.check(key)
    try:
        created_session = auth_service.register(
            session, credentials.username, credentials.password
        )
    except RegistrationError as error:
        rate_limiter.record_failure(key)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error
    rate_limiter.record_success(key)
    _set_session_cookie(response, created_session, settings)
    return AuthenticatedUserResponse(
        user=UserResponse.model_validate(created_session.user)
    )


@router.post("/login", response_model=AuthenticatedUserResponse)
def login(
    credentials: AuthCredentialsRequest,
    request: Request,
    response: Response,
    settings: Settings = Depends(get_settings),
    session: Session = Depends(get_session),
) -> AuthenticatedUserResponse:
    """Sign in with generic failure responses."""
    key = _rate_limit_key(request, "login", credentials.username)
    rate_limiter.check(key)
    try:
        created_session = auth_service.login(
            session, credentials.username, credentials.password
        )
    except AuthenticationFailedError as error:
        rate_limiter.record_failure(key)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
        ) from error
    rate_limiter.record_success(key)
    _set_session_cookie(response, created_session, settings)
    return AuthenticatedUserResponse(
        user=UserResponse.model_validate(created_session.user)
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    request: Request,
    response: Response,
    settings: Settings = Depends(get_settings),
    session: Session = Depends(get_session),
) -> None:
    """Revoke the current session and clear the browser cookie."""
    auth_service.logout(session, request.cookies.get(SESSION_COOKIE_NAME))
    response.delete_cookie(
        SESSION_COOKIE_NAME,
        httponly=True,
        secure=settings.environment is Environment.PRODUCTION,
        samesite="lax",
    )


@router.get("/me", response_model=AuthenticatedUserResponse)
def current_user(user: User = Depends(get_current_user)) -> AuthenticatedUserResponse:
    """Return the current authenticated account."""
    return AuthenticatedUserResponse(user=UserResponse.model_validate(user))


def _set_session_cookie(
    response: Response, created_session: CreatedSession, settings: Settings
) -> None:
    response.set_cookie(
        SESSION_COOKIE_NAME,
        created_session.token,
        expires=created_session.expires_at,
        httponly=True,
        secure=settings.environment is Environment.PRODUCTION,
        samesite="lax",
    )


def _rate_limit_key(request: Request, route: str, username: str) -> str:
    try:
        normalized_username = normalize_username(username).normalized
    except ValueError:
        normalized_username = username.strip().lower()
    client = request.client.host if request.client else "unknown"
    return f"{route}:{client}:{normalized_username}"


def _utc_now() -> datetime:
    return datetime.now(UTC)
