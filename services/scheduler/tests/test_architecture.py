"""Architecture guard tests for the scheduler transport boundary."""

from __future__ import annotations

import ast
from pathlib import Path


SERVICE_SOURCE = Path(__file__).parents[1] / "src" / "scheduler_service"
FORBIDDEN_INFRASTRUCTURE_IMPORTS = {
    "aioredis",
    "celery",
    "kombu",
    "ollama",
    "openai",
    "psycopg",
    "pymongo",
    "redis",
    "sqlalchemy",
    "torch",
    "transformers",
}


def _import_roots(source_path: Path) -> set[str]:
    """Return the top-level absolute imports in one service source module."""
    module = ast.parse(source_path.read_text(encoding="utf-8"))
    roots: set[str] = set()
    for node in ast.walk(module):
        if isinstance(node, ast.Import):
            roots.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
            roots.add(node.module.split(".")[0])
    return roots


def test_scheduler_service_does_not_import_forbidden_infrastructure() -> None:
    """The HTTP boundary stays free of persistence, queues, and AI/model clients."""
    imported_roots = set().union(
        *(_import_roots(path) for path in SERVICE_SOURCE.rglob("*.py"))
    )

    assert not imported_roots & FORBIDDEN_INFRASTRUCTURE_IMPORTS
