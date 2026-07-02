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
    """Migration wiring creates the account, session, and planning input schema."""
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
        assert {
            "users",
            "auth_sessions",
            "user_preferences",
            "planning_days",
            "tasks",
            "fixed_events",
            "task_progress",
            "interruptions",
        }.issubset(inspector.get_table_names())
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
        assert {
            "user_id",
            "time_zone",
            "day_start_local",
            "day_end_local",
            "default_buffer_minutes",
        } == {column["name"] for column in inspector.get_columns("user_preferences")}
        assert {
            "id",
            "user_id",
            "local_date",
            "time_zone",
            "current_snapshot_id",
            "created_at",
        } == {column["name"] for column in inspector.get_columns("planning_days")}
        assert {
            "id",
            "planning_day_id",
            "version",
            "created_at",
            "scheduler_version",
            "configuration_json",
        } == {column["name"] for column in inspector.get_columns("schedule_snapshots")}
        assert {
            "id",
            "snapshot_id",
            "position",
            "kind",
            "task_id",
            "fixed_event_id",
            "interruption_id",
            "start_at",
            "end_at",
        } == {column["name"] for column in inspector.get_columns("schedule_items")}
        assert {
            "id",
            "task_id",
            "planning_day_id",
            "completed_minutes",
            "recorded_at",
            "created_at",
        } == {column["name"] for column in inspector.get_columns("task_progress")}
        assert {
            "id",
            "planning_day_id",
            "start_at",
            "end_at",
            "time_zone",
            "reported_at",
            "created_at",
        } == {column["name"] for column in inspector.get_columns("interruptions")}
        assert {
            "id",
            "snapshot_id",
            "position",
            "task_id",
            "reason_code",
            "details_json",
        } == {column["name"] for column in inspector.get_columns("schedule_decisions")}
        assert {
            "id",
            "user_id",
            "title",
            "estimated_minutes",
            "priority",
            "due_date",
            "earliest_start_at",
            "splitting_allowed",
            "min_segment_minutes",
            "status",
            "created_at",
            "updated_at",
        } == {column["name"] for column in inspector.get_columns("tasks")}
        assert {
            "id",
            "planning_day_id",
            "title",
            "start_at",
            "end_at",
            "time_zone",
            "created_at",
            "updated_at",
        } == {column["name"] for column in inspector.get_columns("fixed_events")}
        assert {
            "ck_user_preferences_buffer_non_negative",
            "ck_user_preferences_day_bounds",
        } == {
            constraint["name"]
            for constraint in inspector.get_check_constraints("user_preferences")
        }
        assert {"uq_planning_days_user_date"} == {
            constraint["name"]
            for constraint in inspector.get_unique_constraints("planning_days")
        }
        assert {
            "ck_tasks_estimated_minutes_positive",
            "ck_tasks_priority",
            "ck_tasks_split_settings",
            "ck_tasks_status",
        } == {
            constraint["name"]
            for constraint in inspector.get_check_constraints("tasks")
        }
        assert {"ck_fixed_events_interval"} == {
            constraint["name"]
            for constraint in inspector.get_check_constraints("fixed_events")
        }
        assert {
            "ck_task_progress_completed_minutes_positive",
        } == {
            constraint["name"]
            for constraint in inspector.get_check_constraints("task_progress")
        }
        assert {"ck_interruptions_interval"} == {
            constraint["name"]
            for constraint in inspector.get_check_constraints("interruptions")
        }
        assert {
            "ck_schedule_snapshots_version_positive",
        } == {
            constraint["name"]
            for constraint in inspector.get_check_constraints("schedule_snapshots")
        }
        assert {
            "ck_schedule_items_interval",
            "ck_schedule_items_position",
        } == {
            constraint["name"]
            for constraint in inspector.get_check_constraints("schedule_items")
        }
        assert {
            "ck_schedule_decisions_position",
        } == {
            constraint["name"]
            for constraint in inspector.get_check_constraints("schedule_decisions")
        }
        assert {
            "uq_schedule_snapshots_planning_day_version",
        } == {
            constraint["name"]
            for constraint in inspector.get_unique_constraints("schedule_snapshots")
        }
    finally:
        database.engine.dispose()


def test_alembic_downgrade_drops_sessions_before_users(
    monkeypatch, settings: Settings
) -> None:
    """Rollback removes planning, session, and user tables."""
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
        assert "user_preferences" not in inspect(database.engine).get_table_names()
        assert "planning_days" not in inspect(database.engine).get_table_names()
        assert "tasks" not in inspect(database.engine).get_table_names()
        assert "fixed_events" not in inspect(database.engine).get_table_names()
        assert "task_progress" not in inspect(database.engine).get_table_names()
        assert "interruptions" not in inspect(database.engine).get_table_names()
        assert "schedule_snapshots" not in inspect(database.engine).get_table_names()
        assert "schedule_items" not in inspect(database.engine).get_table_names()
        assert "schedule_decisions" not in inspect(database.engine).get_table_names()
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
