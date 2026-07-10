"""HTTP tests for the intentionally small API foundation."""

from __future__ import annotations

from unittest.mock import Mock

from fastapi.testclient import TestClient

from api_service.app import create_app
from api_service.config import Settings
from api_service.database import Database


def test_health_reports_process_liveness(client: TestClient) -> None:
    """Liveness remains useful even when a later readiness check is unavailable."""
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_health_is_live_without_accessing_an_unavailable_database(
    settings: Settings,
) -> None:
    """A database readiness failure must not turn the liveness check into readiness."""
    unavailable_database = Mock(spec=Database)
    unavailable_database.check_connection.side_effect = OSError("database unavailable")

    with TestClient(
        create_app(settings=settings, database=unavailable_database)
    ) as client:
        response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    unavailable_database.check_connection.assert_not_called()


def test_health_auth_and_planning_routes_are_published(client: TestClient) -> None:
    """The API publishes only the scoped health, auth, and planning surfaces."""
    response = client.get("/openapi.json")

    assert response.status_code == 200
    assert set(response.json()["paths"]) == {
        "/auth/login",
        "/auth/logout",
        "/auth/me",
        "/auth/register",
        "/health",
        "/planning/days",
        "/planning/days/{planning_day_id}",
        "/planning/days/{planning_day_id}/fixed-events",
        "/planning/days/{planning_day_id}/fixed-events/{fixed_event_id}",
        "/planning/days/{planning_day_id}/generate-plan",
        "/planning/days/{planning_day_id}/interruptions",
        "/planning/days/{planning_day_id}/schedule",
        "/planning/days/{planning_day_id}/schedule-snapshots",
        "/planning/days/{planning_day_id}/task-progress",
        "/planning/overviews/month",
        "/planning/overviews/week",
        "/planning/preferences",
        "/planning/schedule-snapshots/{snapshot_id}",
        "/planning/tasks",
        "/planning/tasks/{task_id}",
    }
