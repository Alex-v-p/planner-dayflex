"""Tests that the empty Alembic foundation loads against a clean test database."""

from __future__ import annotations

from pathlib import Path
from shutil import copytree

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
