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
from api_service.infrastructure.models import (
    Interruption,
    PlanningDay,
    ScheduleItem,
    ScheduleSnapshot,
    Task,
    TaskProgress,
)
from api_service.infrastructure.scheduler_client import (
    HttpSchedulerClient,
    ScheduleResultDTO,
    SchedulerUnavailableError,
    SchedulerValidationFailedError,
)


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


def test_generate_canonical_plan_persists_and_reloads_latest_snapshot(
    client: TestClient, database: Database
) -> None:
    register(client, "alice")
    save_canonical_inputs(client)
    day = client.post(
        "/planning/days",
        json={"local_date": "2026-06-22", "time_zone": "Europe/Brussels"},
    ).json()
    fixed_events = save_canonical_fixed_events(client, day["id"])
    tasks = save_canonical_tasks(client)
    client.app.state.scheduler_client = CanonicalSchedulerClient()

    generated = client.post(f"/planning/days/{day['id']}/generate-plan")
    latest = client.get(f"/planning/days/{day['id']}/schedule")

    assert generated.status_code == 201
    assert latest.json() == generated.json()
    payload = generated.json()
    assert payload["version"] == 1
    assert payload["scheduler_version"] == "0.1.0"
    assert payload["configuration"] == {
        "day_start": "08:00:00",
        "day_end": "18:00:00",
        "buffer_minutes": 10,
        "minimum_free_time_minutes": 30,
        "minimum_segment_minutes": 15,
        "maximum_task_segments": 3,
    }
    assert [
        (
            item["kind"],
            item["task_id"],
            item["fixed_event_id"],
            item["start_at"],
            item["end_at"],
        )
        for item in payload["items"]
    ] == [
        (
            "task",
            tasks["Reply to inbox"],
            None,
            "2026-06-22T08:00:00+02:00",
            "2026-06-22T08:45:00+02:00",
        ),
        (
            "buffer",
            None,
            None,
            "2026-06-22T08:45:00+02:00",
            "2026-06-22T08:55:00+02:00",
        ),
        (
            "fixed_event",
            None,
            fixed_events["Team meeting"],
            "2026-06-22T09:00:00+02:00",
            "2026-06-22T10:00:00+02:00",
        ),
        (
            "task",
            tasks["Write report"],
            None,
            "2026-06-22T10:00:00+02:00",
            "2026-06-22T11:30:00+02:00",
        ),
        (
            "buffer",
            None,
            None,
            "2026-06-22T11:30:00+02:00",
            "2026-06-22T11:40:00+02:00",
        ),
        (
            "fixed_event",
            None,
            fixed_events["Lunch appointment"],
            "2026-06-22T12:00:00+02:00",
            "2026-06-22T13:00:00+02:00",
        ),
        (
            "task",
            tasks["Study notes"],
            None,
            "2026-06-22T13:00:00+02:00",
            "2026-06-22T14:30:00+02:00",
        ),
        (
            "buffer",
            None,
            None,
            "2026-06-22T14:30:00+02:00",
            "2026-06-22T14:40:00+02:00",
        ),
        (
            "task",
            tasks["Buy groceries"],
            None,
            "2026-06-22T14:40:00+02:00",
            "2026-06-22T15:10:00+02:00",
        ),
        (
            "buffer",
            None,
            None,
            "2026-06-22T15:10:00+02:00",
            "2026-06-22T15:20:00+02:00",
        ),
        (
            "fixed_event",
            None,
            fixed_events["Collection appointment"],
            "2026-06-22T15:30:00+02:00",
            "2026-06-22T16:00:00+02:00",
        ),
        (
            "designated_free_time",
            None,
            None,
            "2026-06-22T16:00:00+02:00",
            "2026-06-22T18:00:00+02:00",
        ),
    ]
    assert [decision["reason_code"] for decision in payload["decisions"]] == [
        "placed_in_earliest_valid_window",
        "placed_in_earliest_valid_window",
        "placed_in_earliest_valid_window",
        "placed_in_earliest_valid_window",
        "designated_free_time",
    ]

    with next(database.session()) as session:
        planning_day = session.get(PlanningDay, day["id"])
        assert planning_day is not None
        assert planning_day.current_snapshot_id == payload["id"]
        assert len(session.scalars(select(ScheduleSnapshot)).all()) == 1


def test_canonical_interruption_recovery_records_progress_and_revised_snapshot(
    client: TestClient, database: Database
) -> None:
    register(client, "alice")
    save_canonical_inputs(client)
    day = client.post(
        "/planning/days",
        json={"local_date": "2026-06-22", "time_zone": "Europe/Brussels"},
    ).json()
    fixed_events = save_canonical_fixed_events(client, day["id"])
    tasks = save_canonical_tasks(client)
    scheduler_client = RecoverySchedulerClient()
    client.app.state.scheduler_client = scheduler_client

    first = client.post(f"/planning/days/{day['id']}/generate-plan").json()
    with next(database.session()) as session:
        first_item_times = [
            (item.start_at, item.end_at)
            for item in session.scalars(
                select(ScheduleItem)
                .where(ScheduleItem.snapshot_id == first["id"])
                .order_by(ScheduleItem.position)
            )
        ]
    inbox_progress = client.post(
        f"/planning/days/{day['id']}/task-progress",
        json={
            "task_id": tasks["Reply to inbox"],
            "completed_minutes": 45,
            "recorded_at": "2026-06-22T08:45:00+02:00",
        },
    )
    report_progress = client.post(
        f"/planning/days/{day['id']}/task-progress",
        json={
            "task_id": tasks["Write report"],
            "completed_minutes": 90,
            "recorded_at": "2026-06-22T11:30:00+02:00",
        },
    )
    study_progress = client.post(
        f"/planning/days/{day['id']}/task-progress",
        json={
            "task_id": tasks["Study notes"],
            "completed_minutes": 60,
            "recorded_at": "2026-06-22T14:00:00+02:00",
        },
    )
    revised = client.post(
        f"/planning/days/{day['id']}/interruptions",
        json={
            "start_at": "2026-06-22T14:00:00+02:00",
            "end_at": "2026-06-22T15:15:00+02:00",
            "time_zone": "Europe/Brussels",
            "reported_at": "2026-06-22T14:00:00+02:00",
        },
    )
    first_reloaded = client.get(f"/planning/schedule-snapshots/{first['id']}")

    assert inbox_progress.status_code == 201
    assert report_progress.status_code == 201
    assert study_progress.status_code == 201
    assert revised.status_code == 201
    assert first_reloaded.status_code == 200
    assert first_reloaded.json() == first
    payload = revised.json()
    interruption_id = payload["items"][1]["interruption_id"]
    assert first["version"] == 1
    assert payload["version"] == 2
    assert (
        scheduler_client.previous_result["items"][6]["task_id"] == tasks["Study notes"]
    )
    assert (
        scheduler_client.schedule_request["current_at"] == "2026-06-22T14:00:00+02:00"
    )
    assert scheduler_client.schedule_request["interruptions"] == [
        {
            "id": interruption_id,
            "interval": {
                "start": "2026-06-22T14:00:00+02:00",
                "end": "2026-06-22T15:15:00+02:00",
            },
        }
    ]
    assert [
        set(progress) for progress in scheduler_client.schedule_request["task_progress"]
    ] == [
        {"task_id", "completed_minutes", "recorded_at"},
        {"task_id", "completed_minutes", "recorded_at"},
        {"task_id", "completed_minutes", "recorded_at"},
    ]
    assert [
        (
            progress["task_id"],
            progress["completed_minutes"],
            progress["recorded_at"],
        )
        for progress in scheduler_client.schedule_request["task_progress"]
    ] == [
        (tasks["Reply to inbox"], 45, "2026-06-22T08:45:00+02:00"),
        (tasks["Write report"], 90, "2026-06-22T11:30:00+02:00"),
        (tasks["Study notes"], 60, "2026-06-22T14:00:00+02:00"),
    ]
    assert [
        (
            item["kind"],
            item["task_id"],
            item["fixed_event_id"],
            item["interruption_id"],
            item["start_at"],
            item["end_at"],
        )
        for item in payload["items"]
    ] == [
        (
            "task",
            tasks["Study notes"],
            None,
            None,
            "2026-06-22T13:00:00+02:00",
            "2026-06-22T14:00:00+02:00",
        ),
        (
            "interruption",
            None,
            None,
            interruption_id,
            "2026-06-22T14:00:00+02:00",
            "2026-06-22T15:15:00+02:00",
        ),
        (
            "fixed_event",
            None,
            fixed_events["Collection appointment"],
            None,
            "2026-06-22T15:30:00+02:00",
            "2026-06-22T16:00:00+02:00",
        ),
        (
            "task",
            tasks["Study notes"],
            None,
            None,
            "2026-06-22T16:00:00+02:00",
            "2026-06-22T16:30:00+02:00",
        ),
        (
            "buffer",
            None,
            None,
            None,
            "2026-06-22T16:30:00+02:00",
            "2026-06-22T16:40:00+02:00",
        ),
        (
            "task",
            tasks["Buy groceries"],
            None,
            None,
            "2026-06-22T16:40:00+02:00",
            "2026-06-22T17:10:00+02:00",
        ),
        (
            "buffer",
            None,
            None,
            None,
            "2026-06-22T17:10:00+02:00",
            "2026-06-22T17:20:00+02:00",
        ),
        (
            "designated_free_time",
            None,
            None,
            None,
            "2026-06-22T17:20:00+02:00",
            "2026-06-22T18:00:00+02:00",
        ),
    ]
    assert [decision["reason_code"] for decision in payload["decisions"]] == [
        "moved_after_interruption",
        "placed_in_earliest_valid_window",
        "designated_free_time",
    ]

    with next(database.session()) as session:
        planning_day = session.get(PlanningDay, day["id"])
        assert planning_day is not None
        assert planning_day.current_snapshot_id == payload["id"]
        assert len(session.scalars(select(ScheduleSnapshot)).all()) == 2
        assert len(session.scalars(select(TaskProgress)).all()) == 3
        assert len(session.scalars(select(Interruption)).all()) == 1
        interruption_item = session.scalar(
            select(ScheduleItem).where(ScheduleItem.interruption_id == interruption_id)
        )
        assert interruption_item is not None
        assert [
            (item.start_at, item.end_at)
            for item in session.scalars(
                select(ScheduleItem)
                .where(ScheduleItem.snapshot_id == first["id"])
                .order_by(ScheduleItem.position)
            )
        ] == first_item_times


def test_task_progress_is_user_scoped_and_cannot_exceed_estimate(
    client: TestClient,
) -> None:
    register(client, "alice")
    day = create_day(client)
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

    first = client.post(
        f"/planning/days/{day['id']}/task-progress",
        json={
            "task_id": task["id"],
            "completed_minutes": 20,
            "recorded_at": "2026-07-01T09:00:00+02:00",
        },
    )
    duplicate_excess = client.post(
        f"/planning/days/{day['id']}/task-progress",
        json={
            "task_id": task["id"],
            "completed_minutes": 20,
            "recorded_at": "2026-07-01T09:30:00+02:00",
        },
    )

    client.cookies.clear()
    register(client, "bob")
    cross_user_day = client.post(
        f"/planning/days/{day['id']}/task-progress",
        json={
            "task_id": task["id"],
            "completed_minutes": 10,
            "recorded_at": "2026-07-01T10:00:00+02:00",
        },
    )
    bob_day = create_day(client)
    cross_user_task = client.post(
        f"/planning/days/{bob_day['id']}/task-progress",
        json={
            "task_id": task["id"],
            "completed_minutes": 10,
            "recorded_at": "2026-07-01T10:00:00+02:00",
        },
    )

    assert first.status_code == 201
    assert duplicate_excess.status_code == 409
    assert cross_user_day.status_code == 404
    assert cross_user_task.status_code == 404


def test_task_progress_list_is_ordered_empty_and_user_scoped(
    client: TestClient,
) -> None:
    register(client, "alice")
    day = create_day(client)
    task = client.post(
        "/planning/tasks",
        json={
            "title": "Prepare",
            "estimated_minutes": 60,
            "priority": 3,
            "splitting_allowed": False,
            "min_segment_minutes": None,
        },
    ).json()

    empty = client.get(f"/planning/days/{day['id']}/task-progress")
    later = client.post(
        f"/planning/days/{day['id']}/task-progress",
        json={
            "task_id": task["id"],
            "completed_minutes": 15,
            "recorded_at": "2026-07-01T10:00:00+02:00",
        },
    ).json()
    earlier = client.post(
        f"/planning/days/{day['id']}/task-progress",
        json={
            "task_id": task["id"],
            "completed_minutes": 30,
            "recorded_at": "2026-07-01T09:00:00+02:00",
        },
    ).json()
    listed = client.get(f"/planning/days/{day['id']}/task-progress")

    client.cookies.clear()
    register(client, "bob")
    cross_user = client.get(f"/planning/days/{day['id']}/task-progress")
    bob_day = create_day(client)
    bob_empty = client.get(f"/planning/days/{bob_day['id']}/task-progress")

    assert empty.status_code == 200
    assert empty.json() == []
    assert listed.status_code == 200
    assert [progress["id"] for progress in listed.json()] == [
        earlier["id"],
        later["id"],
    ]
    assert cross_user.status_code == 404
    assert bob_empty.status_code == 200
    assert bob_empty.json() == []


def test_invalid_interruption_inputs_are_rejected(client: TestClient) -> None:
    register(client, "alice")
    day = create_day(client)

    no_snapshot = client.post(
        f"/planning/days/{day['id']}/interruptions",
        json={
            "start_at": "2026-07-01T14:00:00+02:00",
            "end_at": "2026-07-01T15:00:00+02:00",
            "time_zone": "Europe/Brussels",
            "reported_at": "2026-07-01T14:00:00+02:00",
        },
    )
    backwards = client.post(
        f"/planning/days/{day['id']}/interruptions",
        json={
            "start_at": "2026-07-01T15:00:00+02:00",
            "end_at": "2026-07-01T14:00:00+02:00",
            "time_zone": "Europe/Brussels",
            "reported_at": "2026-07-01T14:00:00+02:00",
        },
    )
    naive = client.post(
        f"/planning/days/{day['id']}/interruptions",
        json={
            "start_at": "2026-07-01T14:00:00",
            "end_at": "2026-07-01T15:00:00+02:00",
            "time_zone": "Europe/Brussels",
            "reported_at": "2026-07-01T14:00:00+02:00",
        },
    )

    assert no_snapshot.status_code == 404
    assert backwards.status_code == 422
    assert naive.status_code == 422


def test_generate_twice_preserves_history_and_advances_latest(
    client: TestClient,
) -> None:
    register(client, "alice")
    save_canonical_inputs(client)
    day = client.post(
        "/planning/days",
        json={"local_date": "2026-06-22", "time_zone": "Europe/Brussels"},
    ).json()
    save_canonical_fixed_events(client, day["id"])
    save_canonical_tasks(client)
    client.app.state.scheduler_client = CanonicalSchedulerClient()

    first = client.post(f"/planning/days/{day['id']}/generate-plan").json()
    second = client.post(f"/planning/days/{day['id']}/generate-plan").json()
    latest = client.get(f"/planning/days/{day['id']}/schedule").json()
    history = client.get(f"/planning/days/{day['id']}/schedule-snapshots").json()
    first_reloaded = client.get(f"/planning/schedule-snapshots/{first['id']}").json()

    assert first["id"] != second["id"]
    assert first["version"] == 1
    assert second["version"] == 2
    assert latest["id"] == second["id"]
    assert [snapshot["id"] for snapshot in history] == [first["id"], second["id"]]
    assert first_reloaded == first


def test_latest_schedule_before_generation_is_empty_and_safe(
    client: TestClient,
) -> None:
    register(client, "alice")
    day = create_day(client)

    latest = client.get(f"/planning/days/{day['id']}/schedule")
    history = client.get(f"/planning/days/{day['id']}/schedule-snapshots")

    assert latest.status_code == 404
    assert history.status_code == 200
    assert history.json() == []


def test_generate_plan_maps_persisted_inputs_to_scheduler_request(
    client: TestClient,
) -> None:
    register(client, "alice")
    preferences = client.put(
        "/planning/preferences",
        json={
            "time_zone": "Europe/Brussels",
            "day_start_local": "07:30:00",
            "day_end_local": "17:45:00",
            "default_buffer_minutes": 12,
        },
    )
    day = client.post(
        "/planning/days",
        json={"local_date": "2026-07-01", "time_zone": "Europe/Brussels"},
    ).json()
    later_fixed_event = client.post(
        f"/planning/days/{day['id']}/fixed-events",
        json=fixed_event_payload("Workshop", "2026-07-01T13:00:00+02:00", "14:00:00"),
    ).json()
    earlier_fixed_event = client.post(
        f"/planning/days/{day['id']}/fixed-events",
        json=fixed_event_payload("Standup", "2026-07-01T09:00:00+02:00", "09:15:00"),
    ).json()
    active_task = client.post(
        "/planning/tasks",
        json={
            "title": "Draft memo",
            "estimated_minutes": 50,
            "priority": 5,
            "due_date": "2026-07-01",
            "earliest_start_at": "2026-07-01T10:00:00+02:00",
            "splitting_allowed": True,
            "min_segment_minutes": 25,
        },
    ).json()
    unsplit_task = client.post(
        "/planning/tasks",
        json={
            "title": "Call supplier",
            "estimated_minutes": 20,
            "priority": 2,
            "splitting_allowed": False,
            "min_segment_minutes": None,
        },
    ).json()
    removed_task = client.post(
        "/planning/tasks",
        json={
            "title": "Removed task",
            "estimated_minutes": 20,
            "priority": 1,
            "splitting_allowed": False,
            "min_segment_minutes": None,
        },
    ).json()
    assert client.delete(f"/planning/tasks/{removed_task['id']}").status_code == 204
    scheduler_client = CapturingSchedulerClient()
    client.app.state.scheduler_client = scheduler_client

    response = client.post(f"/planning/days/{day['id']}/generate-plan")

    assert preferences.status_code == 200
    assert response.status_code == 201
    request = scheduler_client.request
    assert request["planning_day"] == {
        "local_date": "2026-07-01",
        "time_zone": "Europe/Brussels",
    }
    assert request["current_at"] == "2026-07-01T07:30:00+02:00"
    assert request["configuration"] == {
        "day_start": "07:30:00",
        "day_end": "17:45:00",
        "buffer_minutes": 12,
        "minimum_free_time_minutes": 30,
        "minimum_segment_minutes": 15,
        "maximum_task_segments": 3,
    }
    assert request["fixed_events"] == [
        {
            "id": earlier_fixed_event["id"],
            "title": "Standup",
            "interval": {
                "start": "2026-07-01T09:00:00+02:00",
                "end": "2026-07-01T09:15:00+02:00",
            },
        },
        {
            "id": later_fixed_event["id"],
            "title": "Workshop",
            "interval": {
                "start": "2026-07-01T13:00:00+02:00",
                "end": "2026-07-01T14:00:00+02:00",
            },
        },
    ]
    assert request["interruptions"] == []
    assert request["task_progress"] == []
    assert [task["id"] for task in request["tasks"]] == [
        active_task["id"],
        unsplit_task["id"],
    ]
    assert request["tasks"][0] == {
        "id": active_task["id"],
        "title": "Draft memo",
        "estimated_minutes": 50,
        "priority": 5,
        "created_at": request["tasks"][0]["created_at"],
        "due_date": "2026-07-01",
        "earliest_start_at": "2026-07-01T10:00:00+02:00",
        "splitting_allowed": True,
    }
    assert request["tasks"][0]["created_at"].endswith("+02:00")
    assert request["tasks"][1]["title"] == "Call supplier"
    assert request["tasks"][1]["due_date"] is None
    assert request["tasks"][1]["earliest_start_at"] is None
    assert request["tasks"][1]["splitting_allowed"] is False


def test_schedule_generation_and_reads_are_user_scoped(client: TestClient) -> None:
    register(client, "alice")
    save_canonical_inputs(client)
    day = client.post(
        "/planning/days",
        json={"local_date": "2026-06-22", "time_zone": "Europe/Brussels"},
    ).json()
    save_canonical_fixed_events(client, day["id"])
    save_canonical_tasks(client)
    client.app.state.scheduler_client = CanonicalSchedulerClient()
    snapshot = client.post(f"/planning/days/{day['id']}/generate-plan").json()

    client.cookies.clear()
    register(client, "bob")

    assert client.post(f"/planning/days/{day['id']}/generate-plan").status_code == 404
    assert client.get(f"/planning/days/{day['id']}/schedule").status_code == 404
    assert (
        client.get(f"/planning/days/{day['id']}/schedule-snapshots").status_code == 404
    )
    assert (
        client.get(f"/planning/schedule-snapshots/{snapshot['id']}").status_code == 404
    )


@pytest.mark.parametrize(
    ("scheduler_error,status_code"),
    [
        (SchedulerValidationFailedError(), 422),
        (SchedulerUnavailableError(), 503),
    ],
)
def test_scheduler_failures_leave_no_partial_snapshot(
    client: TestClient,
    database: Database,
    scheduler_error: Exception,
    status_code: int,
) -> None:
    register(client, "alice")
    save_canonical_inputs(client)
    day = client.post(
        "/planning/days",
        json={"local_date": "2026-06-22", "time_zone": "Europe/Brussels"},
    ).json()
    save_canonical_fixed_events(client, day["id"])
    save_canonical_tasks(client)
    client.app.state.scheduler_client = FailingSchedulerClient(scheduler_error)

    response = client.post(f"/planning/days/{day['id']}/generate-plan")

    assert response.status_code == status_code
    with next(database.session()) as session:
        planning_day = session.get(PlanningDay, day["id"])
        assert planning_day is not None
        assert planning_day.current_snapshot_id is None
        assert session.scalars(select(ScheduleSnapshot)).all() == []


def test_malformed_reschedule_result_rolls_back_interruption_and_snapshot(
    client: TestClient, database: Database
) -> None:
    register(client, "alice")
    save_canonical_inputs(client)
    day = client.post(
        "/planning/days",
        json={"local_date": "2026-06-22", "time_zone": "Europe/Brussels"},
    ).json()
    save_canonical_fixed_events(client, day["id"])
    save_canonical_tasks(client)
    scheduler_client = UnknownInterruptionSchedulerClient()
    client.app.state.scheduler_client = scheduler_client
    first = client.post(f"/planning/days/{day['id']}/generate-plan").json()

    response = client.post(
        f"/planning/days/{day['id']}/interruptions",
        json={
            "start_at": "2026-06-22T14:00:00+02:00",
            "end_at": "2026-06-22T15:15:00+02:00",
            "time_zone": "Europe/Brussels",
            "reported_at": "2026-06-22T14:00:00+02:00",
        },
    )

    assert response.status_code == 503
    assert response.json() == {
        "detail": "The scheduler is unavailable. Please try again shortly."
    }
    with next(database.session()) as session:
        planning_day = session.get(PlanningDay, day["id"])
        assert planning_day is not None
        assert planning_day.current_snapshot_id == first["id"]
        assert len(session.scalars(select(ScheduleSnapshot)).all()) == 1
        assert session.scalars(select(Interruption)).all() == []


@pytest.mark.parametrize(
    ("scheduler_error,status_code"),
    [
        (SchedulerValidationFailedError(), 422),
        (SchedulerUnavailableError(), 503),
    ],
)
def test_reschedule_scheduler_failures_roll_back_interruption_and_snapshot(
    client: TestClient,
    database: Database,
    scheduler_error: Exception,
    status_code: int,
) -> None:
    register(client, "alice")
    save_canonical_inputs(client)
    day = client.post(
        "/planning/days",
        json={"local_date": "2026-06-22", "time_zone": "Europe/Brussels"},
    ).json()
    save_canonical_fixed_events(client, day["id"])
    save_canonical_tasks(client)
    client.app.state.scheduler_client = CanonicalSchedulerClient()
    first = client.post(f"/planning/days/{day['id']}/generate-plan").json()
    client.app.state.scheduler_client = FailingSchedulerClient(scheduler_error)

    response = client.post(
        f"/planning/days/{day['id']}/interruptions",
        json={
            "start_at": "2026-06-22T14:00:00+02:00",
            "end_at": "2026-06-22T15:15:00+02:00",
            "time_zone": "Europe/Brussels",
            "reported_at": "2026-06-22T14:00:00+02:00",
        },
    )

    assert response.status_code == status_code
    with next(database.session()) as session:
        planning_day = session.get(PlanningDay, day["id"])
        assert planning_day is not None
        assert planning_day.current_snapshot_id == first["id"]
        assert len(session.scalars(select(ScheduleSnapshot)).all()) == 1
        assert session.scalars(select(Interruption)).all() == []


def test_http_scheduler_client_accepts_scheduler_style_success_envelope(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class SuccessfulSchedulerResponse:
        status_code = 200

        def json(self) -> dict[str, object]:
            return {
                "items": [
                    {
                        "kind": "task",
                        "interval": {
                            "start": "2026-06-22T08:00:00+02:00",
                            "end": "2026-06-22T08:45:00+02:00",
                        },
                        "task_id": "task-id",
                    },
                    {
                        "kind": "designated_free_time",
                        "interval": {
                            "start": "2026-06-22T16:00:00+02:00",
                            "end": "2026-06-22T18:00:00+02:00",
                        },
                    },
                ],
                "decisions": [
                    {
                        "reason_code": "placed_in_earliest_valid_window",
                        "task_id": "task-id",
                        "details": {},
                    }
                ],
                "warnings": [
                    {
                        "code": "locked_time_overlap_merged",
                        "details": {"fixed_event_id": "meeting"},
                    }
                ],
            }

    def fake_post(
        url: str, json: dict[str, object], timeout: float
    ) -> SuccessfulSchedulerResponse:
        assert url == "http://scheduler.test/v1/schedule-day"
        assert json == {"request": "body"}
        assert timeout == 5.0
        return SuccessfulSchedulerResponse()

    monkeypatch.setattr(
        "api_service.infrastructure.scheduler_client.httpx.post", fake_post
    )

    result = HttpSchedulerClient("http://scheduler.test").schedule_day(
        {"request": "body"}
    )

    assert [item.kind for item in result.items] == ["task", "designated_free_time"]
    assert result.decisions[0].reason_code == "placed_in_earliest_valid_window"
    assert result.warnings[0].code == "locked_time_overlap_merged"


def test_http_scheduler_client_posts_reschedule_day_envelope(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class SuccessfulSchedulerResponse:
        status_code = 200

        def json(self) -> dict[str, object]:
            return {
                "items": [
                    {
                        "kind": "designated_free_time",
                        "interval": {
                            "start": "2026-06-22T16:00:00+02:00",
                            "end": "2026-06-22T18:00:00+02:00",
                        },
                    }
                ],
                "decisions": [],
                "warnings": [],
            }

    def fake_post(
        url: str, json: dict[str, object], timeout: float
    ) -> SuccessfulSchedulerResponse:
        assert url == "http://scheduler.test/v1/reschedule-day"
        assert json == {
            "previous_result": {"items": []},
            "schedule_request": {"planning_day": "body"},
        }
        assert timeout == 5.0
        return SuccessfulSchedulerResponse()

    monkeypatch.setattr(
        "api_service.infrastructure.scheduler_client.httpx.post", fake_post
    )

    result = HttpSchedulerClient("http://scheduler.test").reschedule_day(
        {"items": []}, {"planning_day": "body"}
    )

    assert [item.kind for item in result.items] == ["designated_free_time"]


def test_malformed_successful_scheduler_response_returns_503_without_snapshot(
    client: TestClient,
    database: Database,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    register(client, "alice")
    save_canonical_inputs(client)
    day = client.post(
        "/planning/days",
        json={"local_date": "2026-06-22", "time_zone": "Europe/Brussels"},
    ).json()
    save_canonical_fixed_events(client, day["id"])
    save_canonical_tasks(client)
    client.app.state.scheduler_client = HttpSchedulerClient("http://scheduler.test")

    class MalformedSchedulerResponse:
        status_code = 200

        def json(self) -> dict[str, object]:
            return {
                "items": [
                    {
                        "kind": "task",
                        "interval": {
                            "start": "2026-06-22T09:00:00",
                            "end": "2026-06-22T08:00:00+02:00",
                        },
                        "task_id": "scheduler-task-id",
                    }
                ],
                "decisions": [],
                "warnings": [],
            }

    def fake_post(
        url: str, json: dict[str, object], timeout: float
    ) -> MalformedSchedulerResponse:
        assert url == "http://scheduler.test/v1/schedule-day"
        assert json["planning_day"] == {
            "local_date": "2026-06-22",
            "time_zone": "Europe/Brussels",
        }
        assert timeout == 5.0
        return MalformedSchedulerResponse()

    monkeypatch.setattr(
        "api_service.infrastructure.scheduler_client.httpx.post", fake_post
    )

    response = client.post(f"/planning/days/{day['id']}/generate-plan")

    assert response.status_code == 503
    assert response.json() == {
        "detail": "The scheduler is unavailable. Please try again shortly."
    }
    with next(database.session()) as session:
        planning_day = session.get(PlanningDay, day["id"])
        assert planning_day is not None
        assert planning_day.current_snapshot_id is None
        assert session.scalars(select(ScheduleSnapshot)).all() == []


@pytest.mark.parametrize(
    "scheduler_result",
    [
        {
            "items": [
                {
                    "kind": "task",
                    "interval": {
                        "start": "2026-06-22T08:00:00+02:00",
                        "end": "2026-06-22T08:45:00+02:00",
                    },
                    "task_id": "unknown-task-id",
                }
            ],
            "decisions": [],
            "warnings": [],
        },
        {
            "items": [
                {
                    "kind": "task",
                    "interval": {
                        "start": "2026-06-22T08:00:00+02:00",
                        "end": "2026-06-22T08:45:00+02:00",
                    },
                    "task_id": None,
                }
            ],
            "decisions": [],
            "warnings": [],
        },
        {
            "items": [
                {
                    "kind": "buffer",
                    "interval": {
                        "start": "2026-06-22T08:45:00+02:00",
                        "end": "2026-06-22T08:55:00+02:00",
                    },
                    "task_id": "unknown-task-id",
                }
            ],
            "decisions": [],
            "warnings": [],
        },
        {
            "items": [
                {
                    "kind": "out_of_contract_kind",
                    "interval": {
                        "start": "2026-06-22T08:00:00+02:00",
                        "end": "2026-06-22T08:45:00+02:00",
                    },
                }
            ],
            "decisions": [],
            "warnings": [],
        },
        {
            "items": [
                {
                    "kind": "interruption",
                    "interval": {
                        "start": "2026-06-22T14:00:00+02:00",
                        "end": "2026-06-22T15:00:00+02:00",
                    },
                }
            ],
            "decisions": [],
            "warnings": [],
        },
        {
            "items": [
                {
                    "kind": "designated_free_time",
                    "interval": {
                        "start": "2026-06-22T16:00:00+02:00",
                        "end": "2026-06-22T18:00:00+02:00",
                    },
                }
            ],
            "decisions": [
                {
                    "reason_code": "placed_in_earliest_valid_window",
                    "task_id": "unknown-task-id",
                    "details": {},
                }
            ],
            "warnings": [],
        },
        {
            "items": [
                {
                    "kind": "designated_free_time",
                    "interval": {
                        "start": "2026-06-22T16:00:00+02:00",
                        "end": "2026-06-22T18:00:00+02:00",
                    },
                }
            ],
            "decisions": [
                {
                    "reason_code": "out_of_contract_reason",
                    "details": {},
                }
            ],
            "warnings": [],
        },
        {
            "items": [
                {
                    "kind": "designated_free_time",
                    "interval": {
                        "start": "2026-06-22T16:00:00+02:00",
                        "end": "2026-06-22T18:00:00+02:00",
                    },
                }
            ],
            "decisions": [],
            "warnings": [
                {
                    "code": "out_of_contract_warning",
                    "details": {},
                }
            ],
        },
    ],
)
def test_malformed_scheduler_contract_values_return_503_without_snapshot(
    client: TestClient,
    database: Database,
    scheduler_result: dict[str, object],
) -> None:
    register(client, "alice")
    save_canonical_inputs(client)
    day = client.post(
        "/planning/days",
        json={"local_date": "2026-06-22", "time_zone": "Europe/Brussels"},
    ).json()
    save_canonical_fixed_events(client, day["id"])
    save_canonical_tasks(client)
    client.app.state.scheduler_client = StaticResultSchedulerClient(scheduler_result)

    response = client.post(f"/planning/days/{day['id']}/generate-plan")

    assert_generate_plan_503_without_snapshot(response, database, day["id"])


def test_cross_user_scheduler_task_id_returns_503_without_snapshot(
    client: TestClient,
    database: Database,
) -> None:
    register(client, "bob")
    bob_task = client.post(
        "/planning/tasks",
        json={
            "title": "Bob task",
            "estimated_minutes": 30,
            "priority": 3,
            "splitting_allowed": False,
            "min_segment_minutes": None,
        },
    ).json()
    client.cookies.clear()
    register(client, "alice")
    save_canonical_inputs(client)
    day = client.post(
        "/planning/days",
        json={"local_date": "2026-06-22", "time_zone": "Europe/Brussels"},
    ).json()
    save_canonical_fixed_events(client, day["id"])
    save_canonical_tasks(client)
    client.app.state.scheduler_client = StaticResultSchedulerClient(
        {
            "items": [
                {
                    "kind": "task",
                    "interval": {
                        "start": "2026-06-22T08:00:00+02:00",
                        "end": "2026-06-22T08:30:00+02:00",
                    },
                    "task_id": bob_task["id"],
                }
            ],
            "decisions": [],
            "warnings": [],
        }
    )

    response = client.post(f"/planning/days/{day['id']}/generate-plan")

    assert_generate_plan_503_without_snapshot(response, database, day["id"])


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
        client.post("/planning/days/day-id/generate-plan"),
        client.post(
            "/planning/days/day-id/task-progress",
            json={
                "task_id": "task-id",
                "completed_minutes": 10,
                "recorded_at": "2026-07-01T09:00:00+02:00",
            },
        ),
        client.get("/planning/days/day-id/task-progress"),
        client.post(
            "/planning/days/day-id/interruptions",
            json={
                "start_at": "2026-07-01T10:00:00+02:00",
                "end_at": "2026-07-01T11:00:00+02:00",
                "time_zone": "Europe/Brussels",
                "reported_at": "2026-07-01T10:00:00+02:00",
            },
        ),
        client.get("/planning/days/day-id/schedule"),
        client.get("/planning/days/day-id/schedule-snapshots"),
        client.get("/planning/schedule-snapshots/snapshot-id"),
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


def save_canonical_inputs(client: TestClient) -> None:
    response = client.put(
        "/planning/preferences",
        json={
            "time_zone": "Europe/Brussels",
            "day_start_local": "08:00:00",
            "day_end_local": "18:00:00",
            "default_buffer_minutes": 10,
        },
    )
    assert response.status_code == 200


def save_canonical_fixed_events(client: TestClient, day_id: str) -> dict[str, str]:
    fixed_events: dict[str, str] = {}
    for title, start_at, end_time in [
        ("Team meeting", "2026-06-22T09:00:00+02:00", "10:00:00"),
        ("Lunch appointment", "2026-06-22T12:00:00+02:00", "13:00:00"),
        ("Collection appointment", "2026-06-22T15:30:00+02:00", "16:00:00"),
    ]:
        response = client.post(
            f"/planning/days/{day_id}/fixed-events",
            json={
                "title": title,
                "start_at": start_at,
                "end_at": f"2026-06-22T{end_time}+02:00",
                "time_zone": "Europe/Brussels",
            },
        )
        assert response.status_code == 201
        fixed_events[title] = response.json()["id"]
    return fixed_events


def save_canonical_tasks(client: TestClient) -> dict[str, str]:
    tasks: dict[str, str] = {}
    for payload in [
        {
            "title": "Reply to inbox",
            "estimated_minutes": 45,
            "priority": 4,
            "splitting_allowed": False,
            "min_segment_minutes": None,
        },
        {
            "title": "Write report",
            "estimated_minutes": 90,
            "priority": 5,
            "splitting_allowed": False,
            "min_segment_minutes": None,
        },
        {
            "title": "Study notes",
            "estimated_minutes": 90,
            "priority": 3,
            "splitting_allowed": True,
            "min_segment_minutes": 15,
        },
        {
            "title": "Buy groceries",
            "estimated_minutes": 30,
            "priority": 2,
            "due_date": "2026-06-22",
            "splitting_allowed": False,
            "min_segment_minutes": None,
        },
    ]:
        response = client.post("/planning/tasks", json=payload)
        assert response.status_code == 201
        tasks[payload["title"]] = response.json()["id"]
    return tasks


class CanonicalSchedulerClient:
    def schedule_day(self, request: dict[str, object]) -> ScheduleResultDTO:
        task_ids = {task["title"]: task["id"] for task in request["tasks"]}
        return ScheduleResultDTO.model_validate(
            {
                "items": [
                    item("task", "08:00:00", "08:45:00", task_ids["Reply to inbox"]),
                    item("buffer", "08:45:00", "08:55:00"),
                    item("fixed_event", "09:00:00", "10:00:00"),
                    item("task", "10:00:00", "11:30:00", task_ids["Write report"]),
                    item("buffer", "11:30:00", "11:40:00"),
                    item("fixed_event", "12:00:00", "13:00:00"),
                    item("task", "13:00:00", "14:30:00", task_ids["Study notes"]),
                    item("buffer", "14:30:00", "14:40:00"),
                    item("task", "14:40:00", "15:10:00", task_ids["Buy groceries"]),
                    item("buffer", "15:10:00", "15:20:00"),
                    item("fixed_event", "15:30:00", "16:00:00"),
                    item("designated_free_time", "16:00:00", "18:00:00"),
                ],
                "decisions": [
                    decision(
                        "placed_in_earliest_valid_window", task_ids["Reply to inbox"]
                    ),
                    decision(
                        "placed_in_earliest_valid_window", task_ids["Write report"]
                    ),
                    decision(
                        "placed_in_earliest_valid_window", task_ids["Study notes"]
                    ),
                    decision(
                        "placed_in_earliest_valid_window", task_ids["Buy groceries"]
                    ),
                    decision("designated_free_time"),
                ],
                "warnings": [],
            }
        )


class RecoverySchedulerClient(CanonicalSchedulerClient):
    def __init__(self) -> None:
        self.previous_result: dict[str, object] = {}
        self.schedule_request: dict[str, object] = {}

    def reschedule_day(
        self,
        previous_result: dict[str, object],
        schedule_request: dict[str, object],
    ) -> ScheduleResultDTO:
        self.previous_result = previous_result
        self.schedule_request = schedule_request
        task_ids = {task["title"]: task["id"] for task in schedule_request["tasks"]}
        interruption = schedule_request["interruptions"][0]
        return ScheduleResultDTO.model_validate(
            {
                "items": [
                    item("task", "13:00:00", "14:00:00", task_ids["Study notes"]),
                    {
                        "kind": "interruption",
                        "interval": interruption["interval"],
                        "task_id": None,
                    },
                    item("fixed_event", "15:30:00", "16:00:00"),
                    item("task", "16:00:00", "16:30:00", task_ids["Study notes"]),
                    item("buffer", "16:30:00", "16:40:00"),
                    item("task", "16:40:00", "17:10:00", task_ids["Buy groceries"]),
                    item("buffer", "17:10:00", "17:20:00"),
                    item("designated_free_time", "17:20:00", "18:00:00"),
                ],
                "decisions": [
                    decision("moved_after_interruption", task_ids["Study notes"]),
                    decision(
                        "placed_in_earliest_valid_window",
                        task_ids["Buy groceries"],
                    ),
                    decision("designated_free_time"),
                ],
                "warnings": [],
            }
        )


class UnknownInterruptionSchedulerClient(CanonicalSchedulerClient):
    def reschedule_day(
        self,
        previous_result: dict[str, object],
        schedule_request: dict[str, object],
    ) -> ScheduleResultDTO:
        return ScheduleResultDTO.model_validate(
            {
                "items": [
                    {
                        "kind": "interruption",
                        "interval": {
                            "start": "2026-06-22T15:00:00+02:00",
                            "end": "2026-06-22T15:15:00+02:00",
                        },
                        "task_id": None,
                    }
                ],
                "decisions": [],
                "warnings": [],
            }
        )


class FailingSchedulerClient:
    def __init__(self, error: Exception) -> None:
        self._error = error

    def schedule_day(self, request: dict[str, object]) -> ScheduleResultDTO:
        raise self._error

    def reschedule_day(
        self,
        previous_result: dict[str, object],
        schedule_request: dict[str, object],
    ) -> ScheduleResultDTO:
        raise self._error


class StaticResultSchedulerClient:
    def __init__(self, result: dict[str, object]) -> None:
        self._result = result

    def schedule_day(self, request: dict[str, object]) -> ScheduleResultDTO:
        return ScheduleResultDTO.model_validate(self._result)

    def reschedule_day(
        self,
        previous_result: dict[str, object],
        schedule_request: dict[str, object],
    ) -> ScheduleResultDTO:
        return ScheduleResultDTO.model_validate(self._result)


class CapturingSchedulerClient:
    def __init__(self) -> None:
        self.request: dict[str, object] = {}

    def schedule_day(self, request: dict[str, object]) -> ScheduleResultDTO:
        self.request = request
        return ScheduleResultDTO.model_validate(
            {
                "items": [
                    {
                        "kind": "designated_free_time",
                        "interval": {
                            "start": "2026-07-01T07:30:00+02:00",
                            "end": "2026-07-01T08:00:00+02:00",
                        },
                    }
                ],
                "decisions": [
                    {
                        "reason_code": "designated_free_time",
                        "details": {"start": "2026-07-01T07:30:00+02:00"},
                    }
                ],
                "warnings": [],
            }
        )

    def reschedule_day(
        self,
        previous_result: dict[str, object],
        schedule_request: dict[str, object],
    ) -> ScheduleResultDTO:
        self.request = schedule_request
        return self.schedule_day(schedule_request)


def item(
    kind: str, start_time: str, end_time: str, task_id: str | None = None
) -> dict[str, object]:
    return {
        "kind": kind,
        "interval": {
            "start": f"2026-06-22T{start_time}+02:00",
            "end": f"2026-06-22T{end_time}+02:00",
        },
        "task_id": task_id,
    }


def decision(reason_code: str, task_id: str | None = None) -> dict[str, object]:
    return {"reason_code": reason_code, "task_id": task_id, "details": {}}


def assert_generate_plan_503_without_snapshot(
    response: object, database: Database, planning_day_id: str
) -> None:
    assert response.status_code == 503
    assert response.json() == {
        "detail": "The scheduler is unavailable. Please try again shortly."
    }
    with next(database.session()) as session:
        planning_day = session.get(PlanningDay, planning_day_id)
        assert planning_day is not None
        assert planning_day.current_snapshot_id is None
        assert session.scalars(select(ScheduleSnapshot)).all() == []


def fixed_event_payload(title: str, start_at: str, end_time: str) -> dict[str, str]:
    return {
        "title": title,
        "start_at": start_at,
        "end_at": f"2026-07-01T{end_time}+02:00",
        "time_zone": "Europe/Brussels",
    }
