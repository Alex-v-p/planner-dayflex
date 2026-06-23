"""HTTP-contract tests for the scheduler transport boundary."""

from __future__ import annotations

from copy import deepcopy

import pytest
from fastapi.testclient import TestClient

from scheduler_service.app import app


client = TestClient(app)


def _interval(start: str, end: str) -> dict[str, str]:
    """Build the explicit-offset interval shape used by public requests."""
    return {"start": start, "end": end}


def _canonical_request() -> dict[str, object]:
    """Return the shared canonical-day request in its HTTP representation."""
    offset = "+02:00"
    return {
        "planning_day": {"local_date": "2026-06-22", "time_zone": "Europe/Brussels"},
        "current_at": f"2026-06-22T08:00:00{offset}",
        "fixed_events": [
            {
                "id": "meeting",
                "title": "Team meeting",
                "interval": _interval(
                    f"2026-06-22T09:00:00{offset}",
                    f"2026-06-22T10:00:00{offset}",
                ),
            },
            {
                "id": "lunch",
                "title": "Lunch appointment",
                "interval": _interval(
                    f"2026-06-22T12:00:00{offset}",
                    f"2026-06-22T13:00:00{offset}",
                ),
            },
            {
                "id": "collection",
                "title": "Collection appointment",
                "interval": _interval(
                    f"2026-06-22T15:30:00{offset}",
                    f"2026-06-22T16:00:00{offset}",
                ),
            },
        ],
        "interruptions": [],
        "tasks": [
            {
                "id": "inbox",
                "title": "Reply to inbox",
                "estimated_minutes": 45,
                "priority": 4,
                "created_at": f"2026-06-22T08:00:00{offset}",
            },
            {
                "id": "report",
                "title": "Write report",
                "estimated_minutes": 90,
                "priority": 5,
                "created_at": f"2026-06-22T08:00:00{offset}",
            },
            {
                "id": "study",
                "title": "Study notes",
                "estimated_minutes": 90,
                "priority": 3,
                "created_at": f"2026-06-22T08:00:00{offset}",
                "splitting_allowed": True,
            },
            {
                "id": "groceries",
                "title": "Buy groceries",
                "estimated_minutes": 30,
                "priority": 2,
                "created_at": f"2026-06-22T08:00:00{offset}",
                "due_date": "2026-06-22",
            },
        ],
    }


def test_health_reports_liveness() -> None:
    """The service exposes a dependency-free liveness contract."""
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_schedule_day_returns_the_explicit_contract_and_reason_codes() -> None:
    """A valid request is delegated to the core and serializes stable facts."""
    response = client.post("/v1/schedule-day", json=_canonical_request())

    assert response.status_code == 200
    result = response.json()
    assert [item["kind"] for item in result["items"]] == [
        "task",
        "buffer",
        "fixed_event",
        "task",
        "buffer",
        "fixed_event",
        "task",
        "buffer",
        "task",
        "buffer",
        "fixed_event",
        "designated_free_time",
    ]
    assert [decision["reason_code"] for decision in result["decisions"]] == [
        "placed_in_earliest_valid_window",
        "placed_in_earliest_valid_window",
        "placed_in_earliest_valid_window",
        "placed_in_earliest_valid_window",
        "designated_free_time",
    ]
    assert result["items"][0] == {
        "kind": "task",
        "interval": {
            "start": "2026-06-22T08:00:00+02:00",
            "end": "2026-06-22T08:45:00+02:00",
        },
        "task_id": "inbox",
    }
    assert result["warnings"] == []


def test_reschedule_day_matches_the_canonical_recovery_contract() -> None:
    """The public recovery endpoint preserves history and stable reason values."""
    initial_response = client.post("/v1/schedule-day", json=_canonical_request())
    assert initial_response.status_code == 200

    recovery_request = deepcopy(_canonical_request())
    recovery_request["current_at"] = "2026-06-22T14:00:00+02:00"
    recovery_request["interruptions"] = [
        {
            "id": "delay",
            "interval": _interval(
                "2026-06-22T14:00:00+02:00", "2026-06-22T15:15:00+02:00"
            ),
        }
    ]
    recovery_request["task_progress"] = [
        {
            "task_id": "inbox",
            "completed_minutes": 45,
            "recorded_at": "2026-06-22T08:45:00+02:00",
        },
        {
            "task_id": "report",
            "completed_minutes": 90,
            "recorded_at": "2026-06-22T11:30:00+02:00",
        },
        {
            "task_id": "study",
            "completed_minutes": 60,
            "recorded_at": "2026-06-22T14:00:00+02:00",
        },
    ]

    response = client.post(
        "/v1/reschedule-day",
        json={
            "previous_result": initial_response.json(),
            "schedule_request": recovery_request,
        },
    )

    assert response.status_code == 200
    result = response.json()
    assert [
        (
            item["kind"],
            item["task_id"],
            item["interval"]["start"],
            item["interval"]["end"],
        )
        for item in result["items"]
    ] == [
        ("task", "inbox", "2026-06-22T08:00:00+02:00", "2026-06-22T08:45:00+02:00"),
        ("task", "report", "2026-06-22T10:00:00+02:00", "2026-06-22T11:30:00+02:00"),
        ("task", "study", "2026-06-22T13:00:00+02:00", "2026-06-22T14:00:00+02:00"),
        (
            "interruption",
            None,
            "2026-06-22T14:00:00+02:00",
            "2026-06-22T15:15:00+02:00",
        ),
        ("fixed_event", None, "2026-06-22T15:30:00+02:00", "2026-06-22T16:00:00+02:00"),
        ("task", "study", "2026-06-22T16:00:00+02:00", "2026-06-22T16:30:00+02:00"),
        ("buffer", None, "2026-06-22T16:30:00+02:00", "2026-06-22T16:40:00+02:00"),
        ("task", "groceries", "2026-06-22T16:40:00+02:00", "2026-06-22T17:10:00+02:00"),
        ("buffer", None, "2026-06-22T17:10:00+02:00", "2026-06-22T17:20:00+02:00"),
        (
            "designated_free_time",
            None,
            "2026-06-22T17:20:00+02:00",
            "2026-06-22T18:00:00+02:00",
        ),
    ]
    assert [decision["reason_code"] for decision in result["decisions"]] == [
        "placed_in_earliest_valid_window",
        "moved_after_interruption",
        "placed_in_earliest_valid_window",
        "moved_after_interruption",
        "designated_free_time",
    ]


def test_schema_errors_use_a_safe_validation_envelope() -> None:
    """A missing offset never reflects request contents or framework details."""
    invalid_request = _canonical_request()
    invalid_request["current_at"] = "2026-06-22T08:00:00"

    response = client.post("/v1/schedule-day", json=invalid_request)

    assert response.status_code == 422
    assert response.json() == {
        "code": "validation_error",
        "details": ["The scheduler request is invalid."],
    }


@pytest.mark.parametrize(
    ("field_name", "invalid_value"),
    [
        ("estimated_minutes", "45"),
        ("priority", True),
        ("splitting_allowed", "true"),
        ("id", 45),
    ],
)
def test_schedule_day_rejects_coerced_task_primitives(
    field_name: str, invalid_value: object
) -> None:
    """Public task fields never coerce strings or booleans into core values."""
    invalid_request = _canonical_request()
    invalid_request["tasks"][0][field_name] = invalid_value

    response = client.post("/v1/schedule-day", json=invalid_request)

    assert response.status_code == 422
    assert response.json() == {
        "code": "validation_error",
        "details": ["The scheduler request is invalid."],
    }


def test_schedule_day_rejects_coerced_scheduler_configuration_numbers() -> None:
    """Configuration numbers also reject booleans before they reach the core."""
    invalid_request = _canonical_request()
    invalid_request["configuration"] = {"buffer_minutes": True}

    response = client.post("/v1/schedule-day", json=invalid_request)

    assert response.status_code == 422
    assert response.json() == {
        "code": "validation_error",
        "details": ["The scheduler request is invalid."],
    }


def test_core_validation_errors_use_the_same_safe_envelope() -> None:
    """Domain-invalid payloads remain client errors without leaking request data."""
    invalid_request = _canonical_request()
    invalid_request["fixed_events"].append(
        {
            "id": "overlap",
            "title": "Private overlapping event",
            "interval": _interval(
                "2026-06-22T09:30:00+02:00", "2026-06-22T10:30:00+02:00"
            ),
        }
    )

    response = client.post("/v1/schedule-day", json=invalid_request)

    assert response.status_code == 422
    assert response.json() == {
        "code": "validation_error",
        "details": ["The scheduler request is invalid."],
    }
    assert "Private overlapping event" not in response.text
