"""add progress and interruptions

Revision ID: 20260702_0004
Revises: 20260701_0003
Create Date: 2026-07-02 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision: str = "20260702_0004"
down_revision: str | None = "20260701_0003"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    """Create immutable progress and interruption records."""
    op.create_table(
        "task_progress",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("task_id", sa.String(length=36), nullable=False),
        sa.Column("planning_day_id", sa.String(length=36), nullable=False),
        sa.Column("completed_minutes", sa.Integer(), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "completed_minutes > 0",
            name="ck_task_progress_completed_minutes_positive",
        ),
        sa.ForeignKeyConstraint(
            ["planning_day_id"], ["planning_days.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_task_progress_planning_day_id", "task_progress", ["planning_day_id"]
    )
    op.create_index("ix_task_progress_task_id", "task_progress", ["task_id"])
    op.create_table(
        "interruptions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("planning_day_id", sa.String(length=36), nullable=False),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("time_zone", sa.String(length=64), nullable=False),
        sa.Column("reported_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("end_at > start_at", name="ck_interruptions_interval"),
        sa.ForeignKeyConstraint(
            ["planning_day_id"], ["planning_days.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_interruptions_planning_day_id", "interruptions", ["planning_day_id"]
    )
    with op.batch_alter_table("schedule_items") as batch_op:
        batch_op.create_foreign_key(
            "fk_schedule_items_interruption_id_interruptions",
            "interruptions",
            ["interruption_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    """Drop progress and interruption records."""
    with op.batch_alter_table("schedule_items") as batch_op:
        batch_op.drop_constraint(
            "fk_schedule_items_interruption_id_interruptions",
            type_="foreignkey",
        )
    op.drop_index("ix_interruptions_planning_day_id", table_name="interruptions")
    op.drop_table("interruptions")
    op.drop_index("ix_task_progress_task_id", table_name="task_progress")
    op.drop_index("ix_task_progress_planning_day_id", table_name="task_progress")
    op.drop_table("task_progress")
