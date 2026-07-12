"""Environment-driven AI service configuration."""

from __future__ import annotations

from enum import StrEnum

from pydantic import AnyHttpUrl, Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class AiProvider(StrEnum):
    """Supported provider adapter choices."""

    DISABLED = "disabled"
    MOCK = "mock"
    EXTERNAL = "external"


class Settings(BaseSettings):
    """Settings loaded from PLANNER_AI_* environment variables."""

    model_config = SettingsConfigDict(env_prefix="PLANNER_AI_", extra="ignore")

    provider_enabled: bool = False
    provider: AiProvider = AiProvider.DISABLED
    model: str = "mock-parser-v1"
    provider_base_url: AnyHttpUrl | None = None
    provider_credential: SecretStr | None = None
    provider_timeout_seconds: float = Field(default=2.0, ge=0.1, le=10.0)
    log_level: str = "INFO"

    @field_validator("model")
    @classmethod
    def validate_model(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("must not be blank")
        return stripped

    @field_validator("log_level")
    @classmethod
    def validate_log_level(cls, value: str) -> str:
        level = value.upper()
        if level not in {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}:
            raise ValueError("must be a standard logging level")
        return level
