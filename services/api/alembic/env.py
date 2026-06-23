"""Alembic environment for future application API product-schema migrations."""

from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from api_service.config import Settings


config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Product models do not exist in TKT-008. Future persistence tickets must set this.
target_metadata = None


def run_migrations_offline() -> None:
    """Configure Alembic without opening a database connection."""
    settings = Settings()
    context.configure(
        url=settings.database_url_value,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Configure Alembic with the same sync PostgreSQL/test boundary as the API."""
    settings = Settings()
    configuration = config.get_section(config.config_ini_section, {})
    configuration["sqlalchemy.url"] = settings.database_url_value
    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
