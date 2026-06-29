"""Authentication integration tests."""

from __future__ import annotations

import logging
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import Depends, Response
from fastapi.testclient import TestClient
from sqlalchemy import select

from api_service.application.auth import AuthService, CreatedSession
from api_service.config import Environment, Settings
from api_service.database import Database
from api_service.domain.auth import SESSION_COOKIE_NAME
from api_service.interfaces.auth import (
    _set_session_cookie,
    get_current_user,
    rate_limiter,
)
from api_service.infrastructure.models import AuthSession, User


@pytest.fixture(autouse=True)
def reset_auth_rate_limiter() -> Iterator[None]:
    rate_limiter._failures.clear()
    try:
        yield
    finally:
        rate_limiter._failures.clear()


def test_registration_creates_user_session_cookie_and_safe_response(
    client: TestClient, database: Database
) -> None:
    response = client.post(
        "/auth/register",
        json={"username": "  Alice_01  ", "password": "correct horse battery"},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["user"]["username"] == "alice_01"
    assert "password_hash" not in str(body)
    assert SESSION_COOKIE_NAME in response.cookies
    assert "httponly" in response.headers["set-cookie"].lower()
    assert "samesite=lax" in response.headers["set-cookie"].lower()
    assert "secure" not in response.headers["set-cookie"].lower()

    with next(database.session()) as session:
        user = session.scalar(
            select(User).where(User.username_normalized == "alice_01")
        )
        assert user is not None
        assert user.password_hash != "correct horse battery"
        auth_session = session.scalar(
            select(AuthSession).where(AuthSession.user_id == user.id)
        )
        assert auth_session is not None
        assert auth_session.token_hash != response.cookies[SESSION_COOKIE_NAME]
        assert len(auth_session.token_hash) == 64


def test_session_cookie_is_secure_only_in_production() -> None:
    response = Response()
    settings = Settings(
        environment=Environment.PRODUCTION,
        database_url="postgresql+psycopg://user:password@example.test:5432/planner",
    )
    user = User(
        id="user-id",
        username="alice",
        username_normalized="alice",
        password_hash="not-returned",
        created_at=datetime.now(UTC),
    )

    _set_session_cookie(
        response,
        CreatedSession(
            user=user,
            token="opaque-token",
            expires_at=datetime.now(UTC) + timedelta(days=7),
        ),
        settings,
    )

    assert "secure" in response.headers["set-cookie"].lower()


@pytest.mark.parametrize("route", ["/auth/register", "/auth/login"])
def test_request_validation_does_not_echo_overlong_password(
    client: TestClient, route: str
) -> None:
    secret = "x" * 300

    response = client.post(
        route,
        json={"username": "alice", "password": secret},
    )

    assert response.status_code == 422
    rendered_response = response.text
    assert secret not in rendered_response
    assert '"password"' in rendered_response
    assert "String should have at most 256 characters" in rendered_response


@pytest.mark.parametrize("route", ["/auth/register", "/auth/login"])
def test_request_validation_does_not_echo_malformed_password_input(
    client: TestClient, route: str
) -> None:
    secret = "correct horse battery"

    response = client.post(
        route,
        json={"username": "alice", "password": {"raw": secret}},
    )

    assert response.status_code == 422
    rendered_response = response.text
    assert secret not in rendered_response
    assert '"password"' in rendered_response
    assert "Input should be a valid string" in rendered_response


@pytest.mark.parametrize(
    ("username", "password", "expected_detail"),
    [
        ("ab", "correct horse battery", "Username must be 3-32"),
        ("not allowed", "correct horse battery", "Username must be 3-32"),
        ("valid-user", "too-short", "Password must be 12-128"),
    ],
)
def test_registration_rejects_invalid_username_or_password(
    client: TestClient, username: str, password: str, expected_detail: str
) -> None:
    response = client.post(
        "/auth/register",
        json={"username": username, "password": password},
    )

    assert response.status_code == 400
    assert expected_detail in response.json()["detail"]


def test_registration_rejects_duplicate_normalized_usernames(
    client: TestClient,
) -> None:
    first = client.post(
        "/auth/register",
        json={"username": "Alice", "password": "correct horse battery"},
    )
    second = client.post(
        "/auth/register",
        json={"username": " alice ", "password": "correct horse battery"},
    )

    assert first.status_code == 201
    assert second.status_code == 400
    assert second.json()["detail"] == "Username is already in use."


def test_login_uses_generic_failure_for_unknown_user_and_wrong_password(
    client: TestClient,
) -> None:
    client.post(
        "/auth/register",
        json={"username": "alice", "password": "correct horse battery"},
    )

    unknown = client.post(
        "/auth/login",
        json={"username": "unknown", "password": "correct horse battery"},
    )
    wrong_password = client.post(
        "/auth/login",
        json={"username": "alice", "password": "wrong horse battery"},
    )

    assert unknown.status_code == 401
    assert wrong_password.status_code == 401
    assert unknown.json() == wrong_password.json()
    assert unknown.json()["detail"] == "Invalid username or password."


@pytest.mark.parametrize("username", ["ab", "not allowed", "alice!"])
def test_login_uses_generic_failure_for_invalid_username(
    client: TestClient, username: str
) -> None:
    response = client.post(
        "/auth/login",
        json={"username": username, "password": "correct horse battery"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid username or password."


def test_login_creates_session_and_current_user_resolves_identity(
    client: TestClient,
) -> None:
    client.post(
        "/auth/register",
        json={"username": "alice", "password": "correct horse battery"},
    )
    client.cookies.clear()

    login = client.post(
        "/auth/login",
        json={"username": "Alice", "password": "correct horse battery"},
    )
    current_user = client.get("/auth/me")

    assert login.status_code == 200
    assert current_user.status_code == 200
    assert current_user.json()["user"]["username"] == "alice"


def test_current_user_requires_valid_session(client: TestClient) -> None:
    response = client.get("/auth/me")

    assert response.status_code == 401
    assert response.json()["detail"] == "Authentication required."


def test_current_user_rejects_unknown_session_token(client: TestClient) -> None:
    client.cookies.set(SESSION_COOKIE_NAME, "not-issued-by-this-service")

    response = client.get("/auth/me")

    assert response.status_code == 401
    assert response.json()["detail"] == "Authentication required."


def test_current_user_rejects_expired_session(
    client: TestClient, database: Database
) -> None:
    register = client.post(
        "/auth/register",
        json={"username": "alice", "password": "correct horse battery"},
    )
    assert register.status_code == 201

    with next(database.session()) as session:
        auth_session = session.scalar(select(AuthSession))
        assert auth_session is not None
        auth_session.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        session.commit()

    response = client.get("/auth/me")

    assert response.status_code == 401
    assert response.json()["detail"] == "Authentication required."


def test_protected_dependency_uses_session_identity_not_browser_supplied_user_id(
    client: TestClient,
) -> None:
    @client.app.get("/test/protected/{claimed_user_id}")
    def protected_identity(
        claimed_user_id: str, user: User = Depends(get_current_user)
    ) -> dict[str, str]:
        return {"claimed_user_id": claimed_user_id, "authenticated_user_id": user.id}

    first = client.post(
        "/auth/register",
        json={"username": "alice", "password": "correct horse battery"},
    )
    client.cookies.clear()
    second = client.post(
        "/auth/register",
        json={"username": "bob", "password": "correct horse battery"},
    )

    response = client.get(f"/test/protected/{first.json()['user']['id']}")

    assert second.status_code == 201
    assert response.status_code == 200
    assert response.json() == {
        "claimed_user_id": first.json()["user"]["id"],
        "authenticated_user_id": second.json()["user"]["id"],
    }


def test_logout_revokes_session_and_clears_cookie(
    client: TestClient, database: Database
) -> None:
    client.post(
        "/auth/register",
        json={"username": "alice", "password": "correct horse battery"},
    )

    logout = client.post("/auth/logout")
    current_user = client.get("/auth/me")

    assert logout.status_code == 204
    assert current_user.status_code == 401
    assert SESSION_COOKIE_NAME not in client.cookies
    with next(database.session()) as session:
        auth_session = session.scalar(select(AuthSession))
        assert auth_session is not None
        assert auth_session.revoked_at is not None


def test_password_change_helper_revokes_existing_sessions(
    client: TestClient, database: Database
) -> None:
    client.post(
        "/auth/register",
        json={"username": "alice", "password": "correct horse battery"},
    )
    with next(database.session()) as session:
        user = session.scalar(select(User).where(User.username_normalized == "alice"))
        assert user is not None
        AuthService().revoke_user_sessions_after_password_change(session, user.id)

    response = client.get("/auth/me")

    assert response.status_code == 401
    with next(database.session()) as session:
        user = session.scalar(select(User).where(User.username_normalized == "alice"))
        assert user is not None
        assert user.password_changed_at is not None
        assert all(
            auth_session.revoked_at is not None
            for auth_session in session.scalars(select(AuthSession))
        )


def test_rate_limiter_blocks_repeated_failed_logins(client: TestClient) -> None:
    for _ in range(5):
        response = client.post(
            "/auth/login",
            json={"username": "alice", "password": "correct horse battery"},
        )
        assert response.status_code == 401

    blocked = client.post(
        "/auth/login",
        json={"username": "alice", "password": "correct horse battery"},
    )

    assert blocked.status_code == 429


def test_auth_logs_do_not_emit_credentials_or_hashes(
    client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.INFO):
        response = client.post(
            "/auth/register",
            json={"username": "alice", "password": "correct horse battery"},
        )

    assert response.status_code == 201
    rendered_logs = "\n".join(record.getMessage() for record in caplog.records)
    assert "correct horse battery" not in rendered_logs
    assert SESSION_COOKIE_NAME not in rendered_logs
    assert "password_hash" not in rendered_logs
    assert "token_hash" not in rendered_logs
