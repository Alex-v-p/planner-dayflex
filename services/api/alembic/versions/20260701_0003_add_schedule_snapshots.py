"""add schedule snapshots

Revision ID: 20260701_0003
Revises: 20260701_0002
Create Date: 2026-07-01 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision: str = "20260701_0003"
down_revision: str | None = "20260701_0002"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    """Create immutable schedule snapshot tables and latest pointer."""
    op.create_table(
        "schedule_snapshots",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("planning_day_id", sa.String(length=36), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("scheduler_version", sa.String(length=32), nullable=False),
        sa.Column("configuration_json", sa.JSON(), nullable=False),
        sa.CheckConstraint(
            "version > 0", name="ck_schedule_snapshots_version_positive"
        ),
        sa.ForeignKeyConstraint(
            ["planning_day_id"], ["planning_days.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "planning_day_id",
            "version",
            name="uq_schedule_snapshots_planning_day_version",
        ),
    )
    op.create_index(
        "ix_schedule_snapshots_planning_day_id",
        "schedule_snapshots",
        ["planning_day_id"],
    )
    op.create_table(
        "schedule_items",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("snapshot_id", sa.String(length=36), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("task_id", sa.String(length=36), nullable=True),
        sa.Column("fixed_event_id", sa.String(length=36), nullable=True),
        sa.Column("interruption_id", sa.String(length=36), nullable=True),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("position >= 0", name="ck_schedule_items_position"),
        sa.CheckConstraint("end_at > start_at", name="ck_schedule_items_interval"),
        sa.ForeignKeyConstraint(
            ["fixed_event_id"], ["fixed_events.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["snapshot_id"], ["schedule_snapshots.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_schedule_items_snapshot_id", "schedule_items", ["snapshot_id"])
    op.create_table(
        "schedule_decisions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("snapshot_id", sa.String(length=36), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("task_id", sa.String(length=36), nullable=True),
        sa.Column("reason_code", sa.String(length=64), nullable=False),
        sa.Column("details_json", sa.JSON(), nullable=False),
        sa.CheckConstraint("position >= 0", name="ck_schedule_decisions_position"),
        sa.ForeignKeyConstraint(
            ["snapshot_id"], ["schedule_snapshots.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_schedule_decisions_snapshot_id", "schedule_decisions", ["snapshot_id"]
    )
    with op.batch_alter_table("planning_days") as batch_op:
        batch_op.add_column(
            sa.Column("current_snapshot_id", sa.String(length=36), nullable=True)
        )
        batch_op.create_foreign_key(
            "fk_planning_days_current_snapshot_id_schedule_snapshots",
            "schedule_snapshots",
            ["current_snapshot_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_index(
            "ix_planning_days_current_snapshot_id", ["current_snapshot_id"]
        )


def downgrade() -> None:
    """Drop schedule history tables and latest pointer in dependency order."""
    with op.batch_alter_table("planning_days") as batch_op:
        batch_op.drop_index("ix_planning_days_current_snapshot_id")
        batch_op.drop_constraint(
            "fk_planning_days_current_snapshot_id_schedule_snapshots",
            type_="foreignkey",
        )
        batch_op.drop_column("current_snapshot_id")
    op.drop_index("ix_schedule_decisions_snapshot_id", table_name="schedule_decisions")
    op.drop_table("schedule_decisions")
    op.drop_index("ix_schedule_items_snapshot_id", table_name="schedule_items")
    op.drop_table("schedule_items")
    op.drop_index(
        "ix_schedule_snapshots_planning_day_id", table_name="schedule_snapshots"
    )
    op.drop_table("schedule_snapshots")
