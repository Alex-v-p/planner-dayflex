"""SQLAlchemy models for API-owned persistence."""

from __future__ import annotations

from datetime import date, datetime, time

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKey, Integer
from sqlalchemy import String, Time, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    """Base metadata for API-owned tables."""


class User(Base):
    """Product account and password credential metadata."""

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    username: Mapped[str] = mapped_column(String(32), nullable=False)
    username_normalized: Mapped[str] = mapped_column(String(32), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    password_changed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    sessions: Mapped[list[AuthSession]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
    preferences: Mapped[UserPreferences | None] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        uselist=False,
    )
    planning_days: Mapped[list[PlanningDay]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
    tasks: Mapped[list[Task]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        UniqueConstraint("username_normalized", name="uq_users_username_normalized"),
    )


class AuthSession(Base):
    """Revocable signed-in session storing only a token hash."""

    __tablename__ = "auth_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    user: Mapped[User] = relationship(back_populates="sessions")

    __table_args__ = (
        UniqueConstraint("token_hash", name="uq_auth_sessions_token_hash"),
    )


class UserPreferences(Base):
    """Per-user planning defaults."""

    __tablename__ = "user_preferences"

    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    time_zone: Mapped[str] = mapped_column(String(64), nullable=False)
    day_start_local: Mapped[time] = mapped_column(Time(), nullable=False)
    day_end_local: Mapped[time] = mapped_column(Time(), nullable=False)
    default_buffer_minutes: Mapped[int] = mapped_column(Integer, nullable=False)

    user: Mapped[User] = relationship(back_populates="preferences")

    __table_args__ = (
        CheckConstraint(
            "day_start_local < day_end_local",
            name="ck_user_preferences_day_bounds",
        ),
        CheckConstraint(
            "default_buffer_minutes >= 0",
            name="ck_user_preferences_buffer_non_negative",
        ),
    )


class PlanningDay(Base):
    """One user's planning context for one local date."""

    __tablename__ = "planning_days"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    local_date: Mapped[date] = mapped_column(Date(), nullable=False)
    time_zone: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    user: Mapped[User] = relationship(back_populates="planning_days")
    fixed_events: Mapped[list[FixedEvent]] = relationship(
        back_populates="planning_day",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        UniqueConstraint("user_id", "local_date", name="uq_planning_days_user_date"),
    )


class Task(Base):
    """User-owned flexible work."""

    __tablename__ = "tasks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    estimated_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    priority: Mapped[int] = mapped_column(Integer, nullable=False)
    due_date: Mapped[date | None] = mapped_column(Date(), nullable=True)
    earliest_start_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    splitting_allowed: Mapped[bool] = mapped_column(Boolean, nullable=False)
    min_segment_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    user: Mapped[User] = relationship(back_populates="tasks")

    __table_args__ = (
        CheckConstraint(
            "estimated_minutes > 0",
            name="ck_tasks_estimated_minutes_positive",
        ),
        CheckConstraint("priority >= 1 AND priority <= 5", name="ck_tasks_priority"),
        CheckConstraint(
            "status IN ('active', 'removed')",
            name="ck_tasks_status",
        ),
        CheckConstraint(
            "("
            "splitting_allowed = false AND min_segment_minutes IS NULL"
            ") OR ("
            "splitting_allowed = true "
            "AND min_segment_minutes IS NOT NULL "
            "AND min_segment_minutes >= 15 "
            "AND min_segment_minutes <= estimated_minutes"
            ")",
            name="ck_tasks_split_settings",
        ),
    )


class FixedEvent(Base):
    """Locked commitment on a planning day."""

    __tablename__ = "fixed_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    planning_day_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("planning_days.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    time_zone: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    planning_day: Mapped[PlanningDay] = relationship(back_populates="fixed_events")

    __table_args__ = (
        CheckConstraint("end_at > start_at", name="ck_fixed_events_interval"),
    )
