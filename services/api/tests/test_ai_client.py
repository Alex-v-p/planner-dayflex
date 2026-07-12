"""AI service client fallback behavior tests."""

from __future__ import annotations

import httpx
import pytest

from api_service.infrastructure.ai_client import HttpAiClient


def test_ai_client_maps_successful_task_result(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        httpx,
        "post",
        lambda *args, **kwargs: httpx.Response(
            200,
            json={
                "status": "suggested",
                "confidence": 0.8,
                "proposed_fields": {
                    "title": "Write report",
                    "estimated_minutes": 45,
                    "priority": 4,
                    "due_date": None,
                    "earliest_start_at": None,
                    "splitting_allowed": None,
                    "min_segment_minutes": None,
                },
                "fallback_reason": None,
                "error_code": None,
            },
        ),
    )

    result = HttpAiClient("http://ai.test").parse_task({"text": "Write report"})

    assert result.status == "suggested"
    assert result.proposed_fields.title == "Write report"


@pytest.mark.parametrize(
    ("exception", "reason", "code"),
    [
        (
            httpx.ConnectError("refused"),
            "service_unavailable",
            "ai_service_unavailable",
        ),
        (httpx.TimeoutException("slow"), "timeout", "ai_service_timeout"),
    ],
)
def test_ai_client_falls_back_for_network_errors(
    monkeypatch: pytest.MonkeyPatch,
    exception: httpx.HTTPError,
    reason: str,
    code: str,
) -> None:
    def raise_error(*args, **kwargs):
        raise exception

    monkeypatch.setattr(httpx, "post", raise_error)

    result = HttpAiClient("http://ai.test").parse_interruption({"text": "from 1 to 2"})

    assert result.status == "fallback"
    assert result.fallback_reason == reason
    assert result.error_code == code


@pytest.mark.parametrize(
    ("response", "reason", "code"),
    [
        (
            httpx.Response(503, json={"detail": "down"}),
            "service_unavailable",
            "ai_service_non_success",
        ),
        (
            httpx.Response(422, json={"detail": "invalid"}),
            "invalid_response",
            "ai_service_rejected_request",
        ),
        (
            httpx.Response(200, content=b"{not-json"),
            "invalid_response",
            "ai_service_invalid_response",
        ),
        (
            httpx.Response(200, json={"status": "suggested"}),
            "invalid_response",
            "ai_service_invalid_response",
        ),
        (
            httpx.Response(
                200,
                json={
                    "status": "suggested",
                    "confidence": "0.8",
                    "proposed_fields": {
                        "title": "Write report",
                        "estimated_minutes": None,
                        "priority": None,
                        "due_date": None,
                        "earliest_start_at": None,
                        "splitting_allowed": None,
                        "min_segment_minutes": None,
                    },
                    "fallback_reason": None,
                    "error_code": None,
                },
            ),
            "invalid_response",
            "ai_service_invalid_response",
        ),
        (
            httpx.Response(
                200,
                json={
                    "status": "suggested",
                    "confidence": 0.8,
                    "proposed_fields": {
                        "title": "Write report",
                        "estimated_minutes": None,
                        "priority": None,
                        "due_date": None,
                        "earliest_start_at": None,
                        "splitting_allowed": None,
                        "min_segment_minutes": None,
                    },
                    "fallback_reason": "provider_error",
                    "error_code": "raw_provider_error",
                },
            ),
            "invalid_response",
            "ai_service_invalid_response",
        ),
        (
            httpx.Response(
                200,
                json={
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
                    "error_code": "",
                },
            ),
            "invalid_response",
            "ai_service_invalid_response",
        ),
    ],
)
def test_ai_client_falls_back_for_unusable_responses(
    monkeypatch: pytest.MonkeyPatch,
    response: httpx.Response,
    reason: str,
    code: str,
) -> None:
    monkeypatch.setattr(httpx, "post", lambda *args, **kwargs: response)

    result = HttpAiClient("http://ai.test").parse_task({"text": "Write report"})

    assert result.status == "fallback"
    assert result.fallback_reason == reason
    assert result.error_code == code


@pytest.mark.parametrize(
    "proposed_fields",
    [
        {"title": "   "},
        {"title": "x" * 201},
        {"estimated_minutes": -5},
        {"estimated_minutes": 1441},
        {"priority": 99},
        {"due_date": "2026-07-11T00:00:00"},
        {"due_date": "2026-07-11 00:00:00"},
        {"due_date": "2026-07-11t00:00:00"},
        {"earliest_start_at": "2026-07-11T09:00:00"},
        {
            "estimated_minutes": 30,
            "splitting_allowed": True,
            "min_segment_minutes": 45,
        },
        {"splitting_allowed": False, "min_segment_minutes": 15},
        {"min_segment_minutes": 5},
    ],
)
def test_ai_client_falls_back_for_invalid_task_proposals(
    monkeypatch: pytest.MonkeyPatch, proposed_fields: dict[str, object]
) -> None:
    monkeypatch.setattr(
        httpx,
        "post",
        lambda *args, **kwargs: httpx.Response(
            200,
            json={
                "status": "suggested",
                "confidence": 0.8,
                "proposed_fields": {
                    "title": "Write report",
                    "estimated_minutes": 45,
                    "priority": 4,
                    "due_date": None,
                    "earliest_start_at": None,
                    "splitting_allowed": None,
                    "min_segment_minutes": None,
                    **proposed_fields,
                },
                "fallback_reason": None,
                "error_code": None,
            },
        ),
    )

    result = HttpAiClient("http://ai.test").parse_task({"text": "Write report"})

    assert result.status == "fallback"
    assert result.fallback_reason == "invalid_response"
    assert result.error_code == "ai_service_invalid_response"


@pytest.mark.parametrize(
    "proposed_fields",
    [
        {"time_zone": "not/a-zone"},
        {"start_at": "2026-07-11T09:00:00"},
        {"end_at": "2026-07-11T10:00:00"},
        {"reported_at": "2026-07-11T09:00:00"},
        {
            "start_at": "2026-07-11T11:00:00+02:00",
            "end_at": "2026-07-11T10:00:00+02:00",
        },
    ],
)
def test_ai_client_falls_back_for_invalid_interruption_proposals(
    monkeypatch: pytest.MonkeyPatch, proposed_fields: dict[str, object]
) -> None:
    monkeypatch.setattr(
        httpx,
        "post",
        lambda *args, **kwargs: httpx.Response(
            200,
            json={
                "status": "suggested",
                "confidence": 0.8,
                "proposed_fields": {
                    "start_at": "2026-07-11T09:00:00+02:00",
                    "end_at": "2026-07-11T10:00:00+02:00",
                    "time_zone": "Europe/Brussels",
                    "reported_at": "2026-07-11T09:00:00+02:00",
                    **proposed_fields,
                },
                "fallback_reason": None,
                "error_code": None,
            },
        ),
    )

    result = HttpAiClient("http://ai.test").parse_interruption({"text": "from 9 to 10"})

    assert result.status == "fallback"
    assert result.fallback_reason == "invalid_response"
    assert result.error_code == "ai_service_invalid_response"


def test_ai_client_uses_bounded_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    captured = {}

    def fake_post(*args, **kwargs):
        captured["timeout"] = kwargs["timeout"]
        return httpx.Response(
            200,
            json={
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
            },
        )

    monkeypatch.setattr(httpx, "post", fake_post)

    HttpAiClient("http://ai.test", timeout_seconds=1.25).parse_task({"text": "x"})

    assert captured["timeout"] == 1.25
