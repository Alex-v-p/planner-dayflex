"""Contract and provider behavior tests for the AI service."""

from __future__ import annotations

from fastapi.testclient import TestClient
import pytest
from pydantic import ValidationError

from ai_service.app import create_app
from ai_service.contracts.parsing import TaskProposalDTO
from ai_service.infrastructure.config import AiProvider, Settings


def client(provider_enabled: bool = True, provider: AiProvider = AiProvider.MOCK):
    return TestClient(
        create_app(Settings(provider_enabled=provider_enabled, provider=provider))
    )


def test_health_reports_liveness_when_provider_is_disabled() -> None:
    response = client(provider_enabled=False).get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_mock_provider_returns_valid_task_suggestion() -> None:
    response = client().post(
        "/v1/parse-task",
        json={
            "text": "Write proposal for 90 minutes priority 5 today after 9",
            "local_date": "2026-07-11",
            "time_zone": "Europe/Brussels",
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "status": "suggested",
        "confidence": 0.72,
        "proposed_fields": {
            "title": "Write proposal",
            "estimated_minutes": 90,
            "priority": 5,
            "due_date": "2026-07-11",
            "earliest_start_at": "2026-07-11T09:00:00+02:00",
            "splitting_allowed": None,
            "min_segment_minutes": None,
        },
        "fallback_reason": None,
        "error_code": None,
    }


def test_mock_provider_returns_interruption_suggestion() -> None:
    response = client().post(
        "/v1/parse-interruption",
        json={
            "text": "Dentist from 14:00 to 15:15",
            "local_date": "2026-07-11",
            "time_zone": "Europe/Brussels",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "suggested"
    assert body["confidence"] == 0.74
    assert body["proposed_fields"] == {
        "start_at": "2026-07-11T14:00:00+02:00",
        "end_at": "2026-07-11T15:15:00+02:00",
        "time_zone": "Europe/Brussels",
        "reported_at": "2026-07-11T14:00:00+02:00",
    }
    assert body["fallback_reason"] is None
    assert body["error_code"] is None


def test_ambiguous_text_returns_explicit_fallback() -> None:
    response = client().post(
        "/v1/parse-task",
        json={"text": "ambiguous ???", "local_date": "2026-07-11"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "status": "fallback",
        "confidence": 0.0,
        "proposed_fields": {
            "title": None,
            "estimated_minutes": None,
            "priority": None,
            "due_date": None,
            "earliest_start_at": None,
            "splitting_allowed": None,
            "min_segment_minutes": None,
        },
        "fallback_reason": "unable_to_parse",
        "error_code": "unable_to_parse",
    }


def test_disabled_provider_returns_explicit_fallback() -> None:
    response = client(provider_enabled=False).post(
        "/v1/parse-interruption",
        json={
            "text": "from 13 to 14",
            "local_date": "2026-07-11",
            "time_zone": "Europe/Brussels",
        },
    )

    assert response.status_code == 200
    assert response.json()["status"] == "fallback"
    assert response.json()["fallback_reason"] == "ai_disabled"
    assert response.json()["error_code"] == "ai_disabled"


def test_external_placeholder_returns_provider_error_fallback() -> None:
    response = client(provider_enabled=True, provider=AiProvider.EXTERNAL).post(
        "/v1/parse-task",
        json={"text": "Write proposal", "local_date": "2026-07-11"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "fallback"
    assert response.json()["fallback_reason"] == "provider_error"
    assert response.json()["error_code"] == "provider_not_configured"


@pytest.mark.parametrize(
    ("reason_code", "expected"),
    [
        (
            "placed_in_earliest_valid_window",
            "first open window",
        ),
        ("moved_after_interruption", "reported unavailable time"),
        ("split_across_available_windows", "splitting is allowed"),
        ("blocked_by_fixed_event", "fixed events"),
        ("blocked_by_interruption", "reported unavailable time"),
        ("missed_before_current_time", "already passed"),
        ("insufficient_time_before_deadline", "before its due date"),
        ("insufficient_remaining_day_time", "remaining day"),
        ("designated_free_time", "kept visible as free time"),
        ("locked_time_overlap_merged", "counted once"),
    ],
)
def test_mock_provider_explains_allowed_schedule_reason_families(
    reason_code: str, expected: str
) -> None:
    response = client().post(
        "/v1/explain-schedule-decision",
        json={
            "reason_code": reason_code,
            "deterministic_reason": (
                "Write report was moved after reported unavailable time."
            ),
            "facts": {
                "task_title": "Write report",
                "task_estimated_minutes": 90,
                "task_priority": 5,
                "task_due_date": None,
                "scheduled_start_at": "2026-07-11T16:00:00+02:00",
                "scheduled_end_at": "2026-07-11T17:30:00+02:00",
                "previous_start_at": None,
                "previous_end_at": None,
                "interruption_start_at": "2026-07-11T14:00:00+02:00",
                "interruption_end_at": "2026-07-11T15:15:00+02:00",
                "day_start_at": "2026-07-11T08:00:00+02:00",
                "day_end_at": "2026-07-11T18:00:00+02:00",
                "free_window_minutes": None,
                "reason_details": {},
            },
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "explained"
    assert body["confidence"] == 0.7
    assert expected in body["explanation"]
    assert body["fallback_reason"] is None
    assert body["error_code"] is None


def test_disabled_provider_returns_explanation_fallback() -> None:
    response = client(provider_enabled=False).post(
        "/v1/explain-schedule-decision",
        json={
            "reason_code": "moved_after_interruption",
            "deterministic_reason": (
                "Write report was moved after reported unavailable time."
            ),
            "facts": {"task_title": "Write report"},
        },
    )

    assert response.status_code == 200
    assert response.json()["status"] == "fallback"
    assert response.json()["fallback_reason"] == "ai_disabled"
    assert response.json()["error_code"] == "ai_disabled"


def test_explanation_schema_rejects_unapproved_reason_codes_and_extra_facts() -> None:
    response = client().post(
        "/v1/explain-schedule-decision",
        json={
            "reason_code": "provider_should_invent",
            "deterministic_reason": "private schedule fact",
            "facts": {
                "task_title": "Write report",
                "raw_prompt": "private prompt",
            },
        },
    )

    assert response.status_code == 422
    assert response.json() == {
        "code": "validation_error",
        "details": ["The AI parse request is invalid."],
    }
    assert "private schedule fact" not in response.text
    assert "private prompt" not in response.text


def test_schema_errors_use_safe_envelope_without_user_text() -> None:
    secret_text = "private medical appointment"
    response = client().post(
        "/v1/parse-task",
        json={"text": secret_text, "time_zone": "not/a-zone"},
    )

    assert response.status_code == 422
    assert response.json() == {
        "code": "validation_error",
        "details": ["The AI parse request is invalid."],
    }
    assert secret_text not in response.text


@pytest.mark.parametrize(
    "local_date",
    [
        "2026-07-11T00:00:00",
        "2026-07-11 00:00:00",
        "2026-07-11t00:00:00",
    ],
)
def test_parse_request_rejects_datetime_shaped_local_date(local_date: str) -> None:
    response = client().post(
        "/v1/parse-task",
        json={"text": "Write proposal", "local_date": local_date},
    )

    assert response.status_code == 422
    assert response.json() == {
        "code": "validation_error",
        "details": ["The AI parse request is invalid."],
    }


@pytest.mark.parametrize(
    "due_date",
    [
        "2026-07-11T00:00:00",
        "2026-07-11 00:00:00",
        "2026-07-11t00:00:00",
    ],
)
def test_task_proposal_rejects_datetime_shaped_due_date(due_date: str) -> None:
    with pytest.raises(ValidationError):
        TaskProposalDTO(title="Write proposal", due_date=due_date)


def test_logs_do_not_emit_user_text_provider_payload_or_credentials(capsys) -> None:
    credential = "secret-provider-token"
    app_client = TestClient(
        create_app(
            Settings(
                provider_enabled=True,
                provider=AiProvider.MOCK,
                provider_credential=credential,
            )
        )
    )

    response = app_client.post(
        "/v1/parse-task",
        json={"text": "private task text for 30 minutes"},
    )

    assert response.status_code == 200
    rendered_logs = capsys.readouterr().err
    assert "parse_completed" in rendered_logs
    assert "private task text" not in rendered_logs
    assert credential not in rendered_logs
    assert "provider_payload" not in rendered_logs


def test_explanation_logs_are_event_only(capsys) -> None:
    app_client = client()

    response = app_client.post(
        "/v1/explain-schedule-decision",
        json={
            "reason_code": "blocked_by_fixed_event",
            "deterministic_reason": "Private task was not scheduled.",
            "facts": {"task_title": "Private task"},
        },
    )

    assert response.status_code == 200
    rendered_logs = capsys.readouterr().err
    assert "explanation_completed" in rendered_logs
    assert "Private task" not in rendered_logs
    assert "Private task was not scheduled" not in rendered_logs
