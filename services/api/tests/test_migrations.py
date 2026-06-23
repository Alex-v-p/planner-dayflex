"""Tests that the empty Alembic foundation loads against a clean test database."""

from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config

from api_service.config import Settings


def test_alembic_upgrade_head_accepts_the_test_database_configuration(
    monkeypatch, settings: Settings
) -> None:
    """Migration wiring is runnable before a future ticket introduces a schema."""
    service_root = Path(__file__).parents[1]
    monkeypatch.setenv("PLANNER_API_ENVIRONMENT", "test")
    monkeypatch.setenv(
        "PLANNER_API_DATABASE_URL", settings.database_url.get_secret_value()
    )
    config = Config(str(service_root / "alembic.ini"))

    command.upgrade(config, "head")
