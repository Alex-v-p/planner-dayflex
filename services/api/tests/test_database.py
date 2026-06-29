"""Tests for the API-owned synchronous database boundary."""

from __future__ import annotations

from sqlalchemy import text

from api_service.database import Database


def test_database_connectivity_check_uses_the_isolated_test_database(
    database: Database,
) -> None:
    """The documented readiness convention proves a configured connection works."""
    database.check_connection()

    with database.engine.connect() as connection:
        assert connection.execute(text("SELECT 1")).scalar_one() == 1
