"""add planning inputs

Revision ID: 20260701_0002
Revises: 20260629_0001
Create Date: 2026-07-01 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision: str = "20260701_0002"
down_revision: str | None = "20260629_0001"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    """Create user-owned planning input tables."""
    op.create_table(
        "user_preferences",
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("time_zone", sa.String(length=64), nullable=False),
        sa.Column("day_start_local", sa.Time(), nullable=False),
        sa.Column("day_end_local", sa.Time(), nullable=False),
        sa.Column("default_buffer_minutes", sa.Integer(), nullable=False),
        sa.CheckConstraint(
            "day_start_local < day_end_local",
            name="ck_user_preferences_day_bounds",
        ),
        sa.CheckConstraint(
            "default_buffer_minutes >= 0",
            name="ck_user_preferences_buffer_non_negative",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id"),
    )
    op.create_table(
        "planning_days",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("local_date", sa.Date(), nullable=False),
        sa.Column("time_zone", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "local_date", name="uq_planning_days_user_date"),
    )
    op.create_index("ix_planning_days_user_id", "planning_days", ["user_id"])
    op.create_table(
        "tasks",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("estimated_minutes", sa.Integer(), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("earliest_start_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("splitting_allowed", sa.Boolean(), nullable=False),
        sa.Column("min_segment_minutes", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "estimated_minutes > 0",
            name="ck_tasks_estimated_minutes_positive",
        ),
        sa.CheckConstraint("priority >= 1 AND priority <= 5", name="ck_tasks_priority"),
        sa.CheckConstraint("status IN ('active', 'removed')", name="ck_tasks_status"),
        sa.CheckConstraint(
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
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_tasks_user_id", "tasks", ["user_id"])
    op.create_table(
        "fixed_events",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("planning_day_id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("time_zone", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("end_at > start_at", name="ck_fixed_events_interval"),
        sa.ForeignKeyConstraint(
            ["planning_day_id"], ["planning_days.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_fixed_events_planning_day_id", "fixed_events", ["planning_day_id"]
    )


def downgrade() -> None:
    """Drop planning input tables in dependency order."""
    op.drop_index("ix_fixed_events_planning_day_id", table_name="fixed_events")
    op.drop_table("fixed_events")
    op.drop_index("ix_tasks_user_id", table_name="tasks")
    op.drop_table("tasks")
    op.drop_index("ix_planning_days_user_id", table_name="planning_days")
    op.drop_table("planning_days")
    op.drop_table("user_preferences")
