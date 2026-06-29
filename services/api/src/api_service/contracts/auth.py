"""HTTP contracts for account authentication."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class AuthCredentialsRequest(BaseModel):
    """Username/password credentials supplied by the browser."""

    username: str = Field(min_length=1, max_length=256)
    password: str = Field(min_length=1, max_length=256)


class UserResponse(BaseModel):
    """Public account identity returned to the browser."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    username: str
    created_at: datetime
    password_changed_at: datetime | None


class AuthenticatedUserResponse(BaseModel):
    """Wrapper for current signed-in account responses."""

    user: UserResponse
