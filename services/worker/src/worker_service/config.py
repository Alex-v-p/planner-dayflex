"""Environment-driven worker configuration."""

from __future__ import annotations

from pydantic import AnyHttpUrl, Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Settings loaded from PLANNER_WORKER_* environment variables."""

    model_config = SettingsConfigDict(env_prefix="PLANNER_WORKER_", extra="ignore")

    redis_url: SecretStr
    ai_service_base_url: AnyHttpUrl | None = None
    log_level: str = "INFO"
    queue_name: str = Field(default="planner-dayflex-worker", min_length=1)

    @field_validator("log_level")
    @classmethod
    def validate_log_level(cls, value: str) -> str:
        level = value.upper()
        if level not in {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}:
            raise ValueError("must be a standard logging level")
        return level

    @property
    def redis_url_value(self) -> str:
        """Return Redis URL only to infrastructure code."""
        return self.redis_url.get_secret_value()
