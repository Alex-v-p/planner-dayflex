"""Isolated application and database fixtures for API tests."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from api_service.app import create_app
from api_service.config import Environment, Settings
from api_service.database import Database


@pytest.fixture
def settings(tmp_path: pytest.TempPathFactory) -> Settings:
    """Point every test at a fresh, file-backed SQLite database."""
    database_path = tmp_path / "api-test.db"
    return Settings(
        environment=Environment.TEST,
        database_url=f"sqlite+pysqlite:///{database_path.as_posix()}",
    )


@pytest.fixture
def database(settings: Settings) -> Iterator[Database]:
    """Provide and then dispose the isolated test database boundary."""
    database = Database.from_settings(settings)
    try:
        yield database
    finally:
        database.engine.dispose()


@pytest.fixture
def client(settings: Settings, database: Database) -> Iterator[TestClient]:
    """Exercise a configured API instance without reading normal environment values."""
    with TestClient(create_app(settings=settings, database=database)) as client:
        yield client
