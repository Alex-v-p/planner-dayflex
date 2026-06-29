"""Synchronous SQLAlchemy database boundary with no product models yet."""

from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import Engine, create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from .config import Settings


def create_engine_from_settings(settings: Settings, **options: object) -> Engine:
    """Create the service-owned sync engine from the configured secret URL."""
    return create_engine(
        settings.database_url_value,
        pool_pre_ping=True,
        **options,
    )


class Database:
    """Own synchronous sessions and the narrow connection-health convention."""

    def __init__(self, engine: Engine) -> None:
        self.engine = engine
        self._sessions = sessionmaker(bind=engine, expire_on_commit=False)

    @classmethod
    def from_settings(cls, settings: Settings) -> Database:
        """Build the database boundary for one configured application instance."""
        return cls(create_engine_from_settings(settings))

    def session(self) -> Generator[Session, None, None]:
        """Yield one unit-of-work session for future API dependencies."""
        with self._sessions() as session:
            yield session

    def check_connection(self) -> None:
        """Raise when the configured database cannot execute a trivial query."""
        with self.engine.connect() as connection:
            connection.execute(text("SELECT 1"))
