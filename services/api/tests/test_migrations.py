"""Tests that Alembic migrations load against a clean test database."""

from __future__ import annotations

from pathlib import Path
from shutil import copytree

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect

from api_service.config import Settings
from api_service.database import Database


def test_alembic_upgrade_head_accepts_the_test_database_configuration(
    monkeypatch, settings: Settings
) -> None:
    """Migration wiring creates the account and session schema."""
    service_root = Path(__file__).parents[1]
    monkeypatch.setenv("PLANNER_API_ENVIRONMENT", "test")
    monkeypatch.setenv(
        "PLANNER_API_DATABASE_URL", settings.database_url.get_secret_value()
    )
    config = Config(str(service_root / "alembic.ini"))

    command.upgrade(config, "head")

    database = Database.from_settings(settings)
    try:
        inspector = inspect(database.engine)
        assert {"users", "auth_sessions"}.issubset(inspector.get_table_names())
        assert {
            "id",
            "username",
            "username_normalized",
            "password_hash",
            "created_at",
            "password_changed_at",
        } == {column["name"] for column in inspector.get_columns("users")}
        assert {
            "id",
            "user_id",
            "token_hash",
            "expires_at",
            "revoked_at",
            "created_at",
        } == {column["name"] for column in inspector.get_columns("auth_sessions")}
    finally:
        database.engine.dispose()


def test_alembic_downgrade_drops_sessions_before_users(
    monkeypatch, settings: Settings
) -> None:
    """Rollback removes the TKT-009 tables."""
    service_root = Path(__file__).parents[1]
    monkeypatch.setenv("PLANNER_API_ENVIRONMENT", "test")
    monkeypatch.setenv(
        "PLANNER_API_DATABASE_URL", settings.database_url.get_secret_value()
    )
    config = Config(str(service_root / "alembic.ini"))

    command.upgrade(config, "head")
    command.downgrade(config, "base")

    database = Database.from_settings(settings)
    try:
        assert "users" not in inspect(database.engine).get_table_names()
        assert "auth_sessions" not in inspect(database.engine).get_table_names()
    finally:
        database.engine.dispose()


def test_alembic_revision_generation_uses_the_generic_template_in_a_temp_dir(
    tmp_path: Path,
) -> None:
    """Revision generation works without creating a product revision in this repository."""
    service_root = Path(__file__).parents[1]
    temporary_script_location = copytree(service_root / "alembic", tmp_path / "alembic")
    config = Config(str(service_root / "alembic.ini"))
    config.set_main_option("script_location", str(temporary_script_location))

    command.revision(
        config,
        message="verify generic template",
        rev_id="template_check",
    )

    generated_revisions = list(
        (temporary_script_location / "versions").glob("template_check_*.py")
    )
    assert len(generated_revisions) == 1
    assert "revision: str = 'template_check'" in generated_revisions[0].read_text(
        encoding="utf-8"
    )
