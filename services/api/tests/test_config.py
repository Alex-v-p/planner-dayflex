"""Tests for required, typed application configuration."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from api_service.config import Environment, Settings


def test_database_url_is_required_without_an_environment_default(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Normal service startup cannot silently target a default database."""
    monkeypatch.delenv("PLANNER_API_DATABASE_URL", raising=False)
    monkeypatch.delenv("PLANNER_API_ENVIRONMENT", raising=False)

    with pytest.raises(ValidationError, match="database_url"):
        Settings()


def test_invalid_database_url_is_rejected(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A malformed URL fails before any database connection is attempted."""
    monkeypatch.setenv("PLANNER_API_ENVIRONMENT", "test")
    monkeypatch.setenv("PLANNER_API_DATABASE_URL", "not a database URL")

    with pytest.raises(ValidationError, match="valid SQLAlchemy database URL"):
        Settings()


def test_non_test_configuration_requires_the_psycopg_postgresql_driver() -> None:
    """SQLite remains an explicit test-only convention, never a local fallback."""
    with pytest.raises(ValidationError, match="postgresql\\+psycopg"):
        Settings(
            environment=Environment.DEVELOPMENT,
            database_url="sqlite+pysqlite:///not-for-development.db",
        )


def test_test_configuration_accepts_an_isolated_sqlite_url() -> None:
    """Persistence integration tests can run without a shared database service."""
    settings = Settings(
        environment=Environment.TEST,
        database_url="sqlite+pysqlite:///isolated-test.db",
    )

    assert settings.environment is Environment.TEST
    assert (
        settings.database_url.get_secret_value()
        == "sqlite+pysqlite:///isolated-test.db"
    )
