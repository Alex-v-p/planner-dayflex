"""Planning input API integration tests."""

from __future__ import annotations

from datetime import UTC, date, datetime
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import select
from unittest.mock import Mock

from api_service.application.planning import (
    PlanningResourceNotFoundError,
    PlanningService,
)
from api_service.database import Database
from api_service.domain.auth import SESSION_COOKIE_NAME
from api_service.infrastructure.models import PlanningDay, Task


PASSWORD = "correct horse battery"


def test_planning_preferences_and_days_are_user_scoped(
    client: TestClient,
) -> None:
    register(client, "alice")

    preferences = client.put(
        "/planning/preferences",
        json={
            "time_zone": "Europe/Brussels",
            "day_start_local": "08:00:00",
            "day_end_local": "18:00:00",
            "default_buffer_minutes": 10,
        },
    )
    fetched_preferences = client.get("/planning/preferences")
    created_day = client.post(
        "/planning/days",
        json={"local_date": "2026-07-01", "time_zone": "Europe/Brussels"},
    )
    listed_days = client.get("/planning/days")
    fetched_day = client.get(f"/planning/days/{created_day.json()['id']}")

    assert preferences.status_code == 200
    assert fetched_preferences.json() == preferences.json()
    assert created_day.status_code == 201
    assert listed_days.json() == [created_day.json()]
    assert fetched_day.json() == created_day.json()

    client.cookies.clear()
    register(client, "bob")

    assert client.get(f"/planning/days/{created_day.json()['id']}").status_code == 404
    assert client.get("/planning/days").json() == []
    assert client.get("/planning/preferences").status_code == 404


def test_preferences_can_be_removed(client: TestClient) -> None:
    register(client, "alice")
    saved = client.put(
        "/planning/preferences",
        json={
            "time_zone": "Europe/Brussels",
            "day_start_local": "08:00:00",
            "day_end_local": "18:00:00",
            "default_buffer_minutes": 10,
        },
    )

    deleted = client.delete("/planning/preferences")
    fetched = client.get("/planning/preferences")

    assert saved.status_code == 200
    assert deleted.status_code == 204
    assert fetched.status_code == 404


def test_fixed_event_crud_rejects_overlaps_and_preserves_ownership(
    client: TestClient,
) -> None:
    alice = register(client, "alice")
    day = create_day(client)
    fixed_event = client.post(
        f"/planning/days/{day['id']}/fixed-events",
        json=fixed_event_payload("Focus", "2026-07-01T09:00:00+02:00", "10:00:00"),
    )
    adjacent = client.post(
        f"/planning/days/{day['id']}/fixed-events",
        json=fixed_event_payload("Call", "2026-07-01T10:00:00+02:00", "11:00:00"),
    )
    overlap = client.post(
        f"/planning/days/{day['id']}/fixed-events",
        json=fixed_event_payload("Overlap", "2026-07-01T09:30:00+02:00", "10:30:00"),
    )
    overlapping_update = client.put(
        f"/planning/days/{day['id']}/fixed-events/{adjacent.json()['id']}",
        json=fixed_event_payload("Call", "2026-07-01T09:30:00+02:00", "10:30:00"),
    )

    assert alice["user"]["username"] == "alice"
    assert fixed_event.status_code == 201
    assert adjacent.status_code == 201
    assert overlap.status_code == 409
    assert overlapping_update.status_code == 409
    assert [
        event["title"]
        for event in client.get(f"/planning/days/{day['id']}/fixed-events").json()
    ] == ["Focus", "Call"]

    client.cookies.clear()
    register(client, "bob")

    assert client.get(f"/planning/days/{day['id']}/fixed-events").status_code == 404
    assert (
        client.post(
            f"/planning/days/{day['id']}/fixed-events",
            json=fixed_event_payload(
                "Borrowed", "2026-07-01T12:00:00+02:00", "13:00:00"
            ),
        ).status_code
        == 404
    )
    assert (
        client.put(
            f"/planning/days/{day['id']}/fixed-events/{fixed_event.json()['id']}",
            json=fixed_event_payload("Moved", "2026-07-01T12:00:00+02:00", "13:00:00"),
        ).status_code
        == 404
    )
    assert (
        client.delete(
            f"/planning/days/{day['id']}/fixed-events/{fixed_event.json()['id']}"
        ).status_code
        == 404
    )

    client.cookies.clear()
    login(client, "alice")

    deleted = client.delete(
        f"/planning/days/{day['id']}/fixed-events/{fixed_event.json()['id']}"
    )
    remaining = client.get(f"/planning/days/{day['id']}/fixed-events")

    assert deleted.status_code == 204
    assert [event["title"] for event in remaining.json()] == ["Call"]


def test_fixed_event_write_lock_query_targets_user_owned_planning_day() -> None:
    session = Mock()
    planning_day = PlanningDay(
        id="day-id",
        user_id="user-id",
        local_date=date(2026, 7, 1),
        time_zone="Europe/Brussels",
        created_at=datetime.now(UTC),
    )
    session.scalar.return_value = planning_day

    locked_day = PlanningService()._get_planning_day_for_update(
        session, "user-id", "day-id"
    )

    statement = session.scalar.call_args.args[0]
    assert locked_day is planning_day
    assert statement._for_update_arg is not None
    rendered_statement = str(statement)
    assert "planning_days.id" in rendered_statement
    assert "planning_days.user_id" in rendered_statement


def test_fixed_event_write_lock_preserves_safe_not_found() -> None:
    session = Mock()
    session.scalar.return_value = None

    with pytest.raises(PlanningResourceNotFoundError):
        PlanningService()._get_planning_day_for_update(session, "user-id", "day-id")


def test_task_crud_soft_removes_tasks(client: TestClient, database: Database) -> None:
    register(client, "alice")

    created = client.post(
        "/planning/tasks",
        json={
            "title": "Write proposal",
            "estimated_minutes": 90,
            "priority": 4,
            "due_date": "2026-07-02",
            "earliest_start_at": "2026-07-01T08:30:00+02:00",
            "splitting_allowed": True,
            "min_segment_minutes": 30,
        },
    )
    updated = client.put(
        f"/planning/tasks/{created.json()['id']}",
        json={
            "title": "Write shorter proposal",
            "estimated_minutes": 45,
            "priority": 5,
            "due_date": None,
            "earliest_start_at": None,
            "splitting_allowed": False,
            "min_segment_minutes": None,
        },
    )
    deleted = client.delete(f"/planning/tasks/{created.json()['id']}")
    listed = client.get("/planning/tasks")

    assert created.status_code == 201
    assert created.json()["status"] == "active"
    assert updated.status_code == 200
    assert updated.json()["title"] == "Write shorter proposal"
    assert updated.json()["splitting_allowed"] is False
    assert deleted.status_code == 204
    assert listed.json() == []

    with next(database.session()) as session:
        task = session.scalar(select(Task).where(Task.id == created.json()["id"]))
        assert task is not None
        assert task.status == "removed"


def test_task_operations_are_isolated_between_users(client: TestClient) -> None:
    register(client, "alice")
    task = client.post(
        "/planning/tasks",
        json={
            "title": "Prepare",
            "estimated_minutes": 30,
            "priority": 3,
            "splitting_allowed": False,
            "min_segment_minutes": None,
        },
    ).json()

    client.cookies.clear()
    register(client, "bob")

    assert client.get("/planning/tasks").json() == []
    assert (
        client.put(
            f"/planning/tasks/{task['id']}",
            json={
                "title": "Changed",
                "estimated_minutes": 30,
                "priority": 3,
                "splitting_allowed": False,
                "min_segment_minutes": None,
            },
        ).status_code
        == 404
    )
    assert client.delete(f"/planning/tasks/{task['id']}").status_code == 404


def test_invalid_planning_inputs_are_rejected(client: TestClient) -> None:
    register(client, "alice")
    day = create_day(client)

    responses = [
        client.put(
            "/planning/preferences",
            json={
                "time_zone": "Not/AZone",
                "day_start_local": "08:00:00",
                "day_end_local": "18:00:00",
                "default_buffer_minutes": 10,
            },
        ),
        client.put(
            "/planning/preferences",
            json={
                "time_zone": "Europe/Brussels",
                "day_start_local": "18:00:00",
                "day_end_local": "08:00:00",
                "default_buffer_minutes": 10,
            },
        ),
        client.post(
            f"/planning/days/{day['id']}/fixed-events",
            json=fixed_event_payload(
                "Backwards", "2026-07-01T10:00:00+02:00", "09:00:00"
            ),
        ),
        client.post(
            f"/planning/days/{day['id']}/fixed-events",
            json={
                "title": "Naive",
                "start_at": "2026-07-01T09:00:00",
                "end_at": "2026-07-01T10:00:00+02:00",
                "time_zone": "Europe/Brussels",
            },
        ),
        client.post(
            "/planning/tasks",
            json={
                "title": "No time",
                "estimated_minutes": 0,
                "priority": 3,
                "splitting_allowed": False,
                "min_segment_minutes": None,
            },
        ),
        client.post(
            "/planning/tasks",
            json={
                "title": "Bad priority",
                "estimated_minutes": 30,
                "priority": 6,
                "splitting_allowed": False,
                "min_segment_minutes": None,
            },
        ),
        client.post(
            "/planning/tasks",
            json={
                "title": "Missing split minimum",
                "estimated_minutes": 30,
                "priority": 3,
                "splitting_allowed": True,
                "min_segment_minutes": None,
            },
        ),
        client.post(
            "/planning/tasks",
            json={
                "title": "Bad split",
                "estimated_minutes": 30,
                "priority": 3,
                "splitting_allowed": True,
                "min_segment_minutes": 10,
            },
        ),
        client.post(
            "/planning/tasks",
            json={
                "title": "Oversized split",
                "estimated_minutes": 30,
                "priority": 3,
                "splitting_allowed": True,
                "min_segment_minutes": 45,
            },
        ),
        client.post(
            "/planning/tasks",
            json={
                "title": "Unexpected split minimum",
                "estimated_minutes": 30,
                "priority": 3,
                "splitting_allowed": False,
                "min_segment_minutes": 15,
            },
        ),
        client.post(
            "/planning/tasks",
            json={
                "title": "Naive start",
                "estimated_minutes": 30,
                "priority": 3,
                "earliest_start_at": "2026-07-01T09:00:00",
                "splitting_allowed": False,
                "min_segment_minutes": None,
            },
        ),
    ]

    assert [response.status_code for response in responses] == [422] * len(responses)


@pytest.mark.parametrize(
    "payload",
    [
        {
            "time_zone": "Europe/Brussels",
            "day_start_local": "08:00:00",
            "day_end_local": "18:00:00",
            "default_buffer_minutes": "10",
        },
        {
            "time_zone": 123,
            "day_start_local": "08:00:00",
            "day_end_local": "18:00:00",
            "default_buffer_minutes": 10,
        },
    ],
)
def test_preferences_reject_coerced_primitive_types(
    client: TestClient, payload: dict[str, object]
) -> None:
    register(client, "alice")

    response = client.put("/planning/preferences", json=payload)

    assert response.status_code == 422


def test_planning_day_rejects_coerced_time_zone(client: TestClient) -> None:
    register(client, "alice")

    response = client.post(
        "/planning/days",
        json={"local_date": "2026-07-01", "time_zone": 123},
    )

    assert response.status_code == 422


def test_planning_day_rejects_datetime_for_date_only_field(
    client: TestClient,
) -> None:
    register(client, "alice")

    response = client.post(
        "/planning/days",
        json={
            "local_date": "2026-07-01T09:00:00+02:00",
            "time_zone": "Europe/Brussels",
        },
    )

    assert response.status_code == 422


@pytest.mark.parametrize(
    "field,value",
    [
        ("title", 123),
        ("time_zone", 123),
    ],
)
def test_fixed_events_reject_coerced_primitive_types(
    client: TestClient, field: str, value: object
) -> None:
    register(client, "alice")
    day = create_day(client)
    payload: dict[str, object] = fixed_event_payload(
        "Focus", "2026-07-01T09:00:00+02:00", "10:00:00"
    )
    payload[field] = value

    response = client.post(f"/planning/days/{day['id']}/fixed-events", json=payload)

    assert response.status_code == 422


@pytest.mark.parametrize(
    "field,value",
    [
        ("title", 123),
        ("estimated_minutes", "30"),
        ("estimated_minutes", True),
        ("priority", "3"),
        ("priority", True),
        ("splitting_allowed", "false"),
        ("min_segment_minutes", "15"),
        ("min_segment_minutes", False),
    ],
)
def test_task_create_rejects_coerced_primitive_types(
    client: TestClient, field: str, value: object
) -> None:
    register(client, "alice")
    payload: dict[str, object] = {
        "title": "Prepare",
        "estimated_minutes": 30,
        "priority": 3,
        "splitting_allowed": True,
        "min_segment_minutes": 15,
    }
    payload[field] = value

    response = client.post("/planning/tasks", json=payload)
    listed = client.get("/planning/tasks")

    assert response.status_code == 422
    assert listed.json() == []


def test_task_create_rejects_extra_fields_and_datetime_due_date(
    client: TestClient,
) -> None:
    register(client, "alice")

    extra_field = client.post(
        "/planning/tasks",
        json={
            "title": "Prepare",
            "estimated_minutes": 30,
            "priority": 3,
            "splitting_allowed": False,
            "min_segment_minutes": None,
            "unexpected": "ignored before",
        },
    )
    datetime_due_date = client.post(
        "/planning/tasks",
        json={
            "title": "Prepare",
            "estimated_minutes": 30,
            "priority": 3,
            "due_date": "2026-07-01T09:00:00+02:00",
            "splitting_allowed": False,
            "min_segment_minutes": None,
        },
    )

    assert extra_field.status_code == 422
    assert datetime_due_date.status_code == 422
    assert client.get("/planning/tasks").json() == []


@pytest.mark.parametrize(
    "field,value",
    [
        ("title", 123),
        ("estimated_minutes", "30"),
        ("priority", True),
        ("splitting_allowed", "false"),
        ("min_segment_minutes", "15"),
    ],
)
def test_task_update_rejects_coerced_primitive_types_before_persistence(
    client: TestClient, field: str, value: object
) -> None:
    register(client, "alice")
    task = client.post(
        "/planning/tasks",
        json={
            "title": "Prepare",
            "estimated_minutes": 30,
            "priority": 3,
            "splitting_allowed": False,
            "min_segment_minutes": None,
        },
    ).json()
    payload: dict[str, object] = {
        "title": "Prepare updated",
        "estimated_minutes": 45,
        "priority": 4,
        "splitting_allowed": True,
        "min_segment_minutes": 15,
    }
    payload[field] = value

    response = client.put(f"/planning/tasks/{task['id']}", json=payload)
    listed = client.get("/planning/tasks")

    assert response.status_code == 422
    assert listed.json()[0]["title"] == "Prepare"


def test_invalid_task_update_is_rejected_before_persistence(
    client: TestClient,
) -> None:
    register(client, "alice")
    task = client.post(
        "/planning/tasks",
        json={
            "title": "Prepare",
            "estimated_minutes": 30,
            "priority": 3,
            "splitting_allowed": False,
            "min_segment_minutes": None,
        },
    ).json()

    invalid_update = client.put(
        f"/planning/tasks/{task['id']}",
        json={
            "title": "Prepare",
            "estimated_minutes": -1,
            "priority": 3,
            "splitting_allowed": False,
            "min_segment_minutes": None,
        },
    )
    listed = client.get("/planning/tasks")

    assert invalid_update.status_code == 422
    assert listed.json()[0]["estimated_minutes"] == 30


def test_planning_routes_require_authentication(client: TestClient) -> None:
    checks = [
        client.get("/planning/preferences"),
        client.put(
            "/planning/preferences",
            json={
                "time_zone": "Europe/Brussels",
                "day_start_local": "08:00:00",
                "day_end_local": "18:00:00",
                "default_buffer_minutes": 10,
            },
        ),
        client.post(
            "/planning/days",
            json={"local_date": "2026-07-01", "time_zone": "Europe/Brussels"},
        ),
        client.get("/planning/days"),
        client.post(
            "/planning/tasks",
            json={
                "title": "Prepare",
                "estimated_minutes": 30,
                "priority": 3,
                "splitting_allowed": False,
                "min_segment_minutes": None,
            },
        ),
    ]

    assert [response.status_code for response in checks] == [401] * len(checks)


def register(client: TestClient, username: str) -> dict[str, object]:
    response = client.post(
        "/auth/register",
        json={"username": username, "password": PASSWORD},
    )
    assert response.status_code == 201
    assert SESSION_COOKIE_NAME in client.cookies
    return response.json()


def login(client: TestClient, username: str) -> None:
    response = client.post(
        "/auth/login",
        json={"username": username, "password": PASSWORD},
    )
    assert response.status_code == 200


def create_day(client: TestClient) -> dict[str, object]:
    response = client.post(
        "/planning/days",
        json={"local_date": "2026-07-01", "time_zone": "Europe/Brussels"},
    )
    assert response.status_code == 201
    return response.json()


def fixed_event_payload(title: str, start_at: str, end_time: str) -> dict[str, str]:
    return {
        "title": title,
        "start_at": start_at,
        "end_at": f"2026-07-01T{end_time}+02:00",
        "time_zone": "Europe/Brussels",
    }
