"""Typed, environment-driven configuration for the application API."""

from __future__ import annotations

from enum import StrEnum

from pydantic import SecretStr, ValidationInfo, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError


class Environment(StrEnum):
    """Deployment environments that affect permitted database drivers."""

    DEVELOPMENT = "development"
    TEST = "test"
    PRODUCTION = "production"


class Settings(BaseSettings):
    """Settings loaded only from explicitly supplied environment variables."""

    model_config = SettingsConfigDict(
        env_prefix="PLANNER_API_",
        extra="ignore",
    )

    environment: Environment = Environment.DEVELOPMENT
    database_url: SecretStr
    log_level: str = "INFO"

    @field_validator("database_url")
    @classmethod
    def validate_database_url(cls, value: SecretStr, info: ValidationInfo) -> SecretStr:
        """Require the production PostgreSQL driver and test-only SQLite use."""
        database_url = value.get_secret_value()
        try:
            parsed_url = make_url(database_url)
        except ArgumentError as error:
            raise ValueError("must be a valid SQLAlchemy database URL") from error

        environment = info.data.get("environment", Environment.DEVELOPMENT)
        if environment is Environment.TEST:
            if parsed_url.drivername != "sqlite+pysqlite":
                raise ValueError("test environment requires a sqlite+pysqlite URL")
        elif parsed_url.drivername != "postgresql+psycopg":
            raise ValueError("requires a postgresql+psycopg URL outside tests")
        return value

    @field_validator("log_level")
    @classmethod
    def validate_log_level(cls, value: str) -> str:
        """Accept only standard, non-numeric logging thresholds."""
        level = value.upper()
        if level not in {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}:
            raise ValueError("must be a standard logging level")
        return level

    @property
    def database_url_value(self) -> str:
        """Return the URL only to the infrastructure code that opens a connection."""
        return self.database_url.get_secret_value()
