"""HTTP tests for the intentionally small API foundation."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_health_reports_process_liveness(client: TestClient) -> None:
    """Liveness remains useful even when a later readiness check is unavailable."""
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_no_product_routes_exist_yet(client: TestClient) -> None:
    """The foundation does not accidentally publish planner or account behavior."""
    response = client.get("/openapi.json")

    assert response.status_code == 200
    assert set(response.json()["paths"]) == {"/health"}
