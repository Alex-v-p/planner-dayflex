"""SQLAlchemy models for API-owned persistence."""

from __future__ import annotations

from datetime import date, datetime, time

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKey, Integer
from sqlalchemy import JSON
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
    current_snapshot_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("schedule_snapshots.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    user: Mapped[User] = relationship(back_populates="planning_days")
    fixed_events: Mapped[list[FixedEvent]] = relationship(
        back_populates="planning_day",
        cascade="all, delete-orphan",
    )
    interruptions: Mapped[list[Interruption]] = relationship(
        back_populates="planning_day",
        cascade="all, delete-orphan",
    )
    task_progress: Mapped[list[TaskProgress]] = relationship(
        back_populates="planning_day",
        cascade="all, delete-orphan",
    )
    schedule_snapshots: Mapped[list[ScheduleSnapshot]] = relationship(
        back_populates="planning_day",
        cascade="all, delete-orphan",
        foreign_keys="ScheduleSnapshot.planning_day_id",
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
    progress_records: Mapped[list[TaskProgress]] = relationship(
        back_populates="task",
        cascade="all, delete-orphan",
    )

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


class TaskProgress(Base):
    """Immutable completion record for a task on a planning day."""

    __tablename__ = "task_progress"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    task_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    planning_day_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("planning_days.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    completed_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    task: Mapped[Task] = relationship(back_populates="progress_records")
    planning_day: Mapped[PlanningDay] = relationship(back_populates="task_progress")

    __table_args__ = (
        CheckConstraint(
            "completed_minutes > 0",
            name="ck_task_progress_completed_minutes_positive",
        ),
    )


class Interruption(Base):
    """Reported unavailable interval on a planning day."""

    __tablename__ = "interruptions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    planning_day_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("planning_days.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    time_zone: Mapped[str] = mapped_column(String(64), nullable=False)
    reported_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    planning_day: Mapped[PlanningDay] = relationship(back_populates="interruptions")

    __table_args__ = (
        CheckConstraint("end_at > start_at", name="ck_interruptions_interval"),
    )


class ScheduleSnapshot(Base):
    """Immutable scheduler output for one planning day."""

    __tablename__ = "schedule_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    planning_day_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("planning_days.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    scheduler_version: Mapped[str] = mapped_column(String(32), nullable=False)
    configuration_json: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False)

    planning_day: Mapped[PlanningDay] = relationship(
        back_populates="schedule_snapshots",
        foreign_keys=[planning_day_id],
    )
    items: Mapped[list[ScheduleItem]] = relationship(
        back_populates="snapshot",
        cascade="all, delete-orphan",
        order_by="ScheduleItem.position",
    )
    decisions: Mapped[list[ScheduleDecision]] = relationship(
        back_populates="snapshot",
        cascade="all, delete-orphan",
        order_by="ScheduleDecision.position",
    )

    __table_args__ = (
        UniqueConstraint(
            "planning_day_id",
            "version",
            name="uq_schedule_snapshots_planning_day_version",
        ),
        CheckConstraint("version > 0", name="ck_schedule_snapshots_version_positive"),
    )


class ScheduleItem(Base):
    """One persisted timeline item inside a snapshot."""

    __tablename__ = "schedule_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    snapshot_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("schedule_snapshots.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    task_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True
    )
    fixed_event_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("fixed_events.id", ondelete="SET NULL"), nullable=True
    )
    interruption_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("interruptions.id", ondelete="SET NULL"), nullable=True
    )
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    snapshot: Mapped[ScheduleSnapshot] = relationship(back_populates="items")

    __table_args__ = (
        CheckConstraint("position >= 0", name="ck_schedule_items_position"),
        CheckConstraint("end_at > start_at", name="ck_schedule_items_interval"),
    )


class ScheduleDecision(Base):
    """Structured scheduler decision or warning persisted with a snapshot."""

    __tablename__ = "schedule_decisions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    snapshot_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("schedule_snapshots.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    task_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True
    )
    reason_code: Mapped[str] = mapped_column(String(64), nullable=False)
    details_json: Mapped[dict[str, str]] = mapped_column(JSON, nullable=False)

    snapshot: Mapped[ScheduleSnapshot] = relationship(back_populates="decisions")

    __table_args__ = (
        CheckConstraint("position >= 0", name="ck_schedule_decisions_position"),
    )
