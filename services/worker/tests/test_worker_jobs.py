"""Worker job contract and processing tests."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
import json
import logging

import fakeredis
import pytest
from rq import Queue, SimpleWorker
from rq.serializers import JSONSerializer

from worker_service.application import jobs
from worker_service.application.jobs import (
    RetryableWorkerJobError,
    process_job,
)
from worker_service.infrastructure.observations import (
    OBSERVATION_PREFIX,
    RESULT_PREFIX,
)


def test_job_can_be_enqueued_consumed_once_and_observed() -> None:
    redis = fakeredis.FakeRedis()
    queue = Queue("planner-dayflex-worker", connection=redis, serializer=JSONSerializer)
    envelope = make_test_job_envelope("job-1", "effect-1")

    queue.enqueue(
        "worker_service.application.jobs.process_job",
        envelope,
        job_id="rq-job-1",
    )
    SimpleWorker([queue], connection=redis, serializer=JSONSerializer).work(burst=True)

    assert redis.get(f"{OBSERVATION_PREFIX}effect-1:count") == b"1"
    assert json.loads(redis.get(f"{OBSERVATION_PREFIX}effect-1"))["message"] == "ok"


def test_duplicate_delivery_does_not_repeat_visible_effect(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    redis = fakeredis.FakeRedis()
    monkeypatch.setattr(jobs, "_current_redis", lambda: redis)
    envelope = make_test_job_envelope("same-idempotency-key", "effect-1")

    first = process_job(envelope)
    second = process_job(envelope)

    assert first == {"status": "completed"}
    assert second == {"status": "duplicate"}
    assert redis.get(f"{OBSERVATION_PREFIX}effect-1:count") == b"1"


def test_retryable_and_permanent_failures_are_observable_and_logged(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    redis = fakeredis.FakeRedis()
    monkeypatch.setattr(jobs, "_current_redis", lambda: redis)
    caplog.set_level(logging.INFO, logger="worker_service")

    with pytest.raises(RetryableWorkerJobError):
        process_job(
            make_test_job_envelope("retryable-key", "effect-1", "retryable_failure")
        )
    permanent_result = process_job(
        make_test_job_envelope("permanent-key", "effect-2", "permanent_failure")
    )

    assert permanent_result == {"status": "permanent_failure"}
    retryable_failure = json.loads(
        redis.get(f"{OBSERVATION_PREFIX}failures:retryable-key")
    )
    permanent_failure = json.loads(
        redis.get(f"{OBSERVATION_PREFIX}failures:permanent-key")
    )
    assert retryable_failure["failure_type"] == "retryable"
    assert permanent_failure["failure_type"] == "permanent"
    assert {record.event for record in caplog.records} >= {
        "worker_job_retryable_failed",
        "worker_job_permanent_failed",
    }


def test_retryable_failure_releases_idempotency_claim_for_retry(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    redis = fakeredis.FakeRedis()
    monkeypatch.setattr(jobs, "_current_redis", lambda: redis)

    with pytest.raises(RetryableWorkerJobError):
        process_job(
            make_test_job_envelope("retryable-key", "effect-1", "retryable_failure")
        )
    retry_result = process_job(make_test_job_envelope("retryable-key", "effect-1"))

    assert retry_result == {"status": "completed"}
    assert redis.get(f"{OBSERVATION_PREFIX}effect-1:count") == b"1"


def test_permanent_failure_keeps_idempotency_claim(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    redis = fakeredis.FakeRedis()
    monkeypatch.setattr(jobs, "_current_redis", lambda: redis)

    first = process_job(
        make_test_job_envelope("permanent-key", "effect-1", "permanent_failure")
    )
    second = process_job(make_test_job_envelope("permanent-key", "effect-1"))

    assert first == {"status": "permanent_failure"}
    assert second == {"status": "duplicate"}
    assert redis.get(f"{OBSERVATION_PREFIX}effect-1:count") is None


def test_cleanup_job_removes_only_stale_worker_observation_and_cache_state(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    redis = fakeredis.FakeRedis()
    monkeypatch.setattr(jobs, "_current_redis", lambda: redis)
    old_recorded_at = (datetime.now(UTC) - timedelta(hours=2)).isoformat()
    new_recorded_at = datetime.now(UTC).isoformat()
    redis.set(
        f"{OBSERVATION_PREFIX}old",
        json.dumps({"recorded_at": old_recorded_at}),
    )
    redis.set(
        f"{OBSERVATION_PREFIX}new",
        json.dumps({"recorded_at": new_recorded_at}),
    )
    redis.set(
        f"{RESULT_PREFIX}old",
        json.dumps({"recorded_at": old_recorded_at}),
    )
    redis.set("unrelated:old", json.dumps({"recorded_at": old_recorded_at}))

    result = process_job(
        {
            "contract_version": 1,
            "kind": "cleanup_stale_observations",
            "idempotency_key": "cleanup-1",
            "payload": {"older_than_seconds": 3600},
        }
    )

    assert result == {"status": "completed", "removed": 2}
    assert redis.get(f"{OBSERVATION_PREFIX}old") is None
    assert redis.get(f"{RESULT_PREFIX}old") is None
    assert redis.get(f"{OBSERVATION_PREFIX}new") is not None
    assert redis.get("unrelated:old") is not None


def test_contract_validation_failure_is_safe_permanent_failure(
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.INFO, logger="worker_service")

    result = process_job(
        {
            "contract_version": 2,
            "kind": "test_job",
            "idempotency_key": "bad-contract",
            "payload": {"effect_key": "effect", "message": "ok"},
        }
    )

    assert result == {"status": "permanent_failure"}
    assert {record.event for record in caplog.records} >= {
        "worker_job_permanent_failed"
    }


def test_payload_validation_failure_is_safe_permanent_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    redis = fakeredis.FakeRedis()
    monkeypatch.setattr(jobs, "_current_redis", lambda: redis)

    result = process_job(
        {
            "contract_version": 1,
            "kind": "test_job",
            "idempotency_key": "bad-payload",
            "payload": {"effect_key": "", "message": "ok"},
        }
    )
    retry = process_job(make_test_job_envelope("bad-payload", "effect-1"))

    assert result == {"status": "permanent_failure"}
    assert retry == {"status": "duplicate"}
    failure = json.loads(redis.get(f"{OBSERVATION_PREFIX}failures:bad-payload"))
    assert failure["failure_type"] == "permanent"


def test_schedule_explanation_job_caches_ai_result_from_approved_job_facts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    redis = fakeredis.FakeRedis()
    captured_request: dict[str, object] = {}
    monkeypatch.setattr(jobs, "_current_redis", lambda: redis)
    monkeypatch.setattr(jobs, "Settings", lambda: FakeSettings("http://ai.test"))

    def explain(_base_url: str | None, request: dict[str, object]) -> dict[str, object]:
        captured_request.update(request)
        return {
            "status": "explained",
            "confidence": 0.8,
            "explanation": "The cached wording.",
            "fallback_reason": None,
            "error_code": None,
        }

    monkeypatch.setattr(jobs, "explain_schedule_decision", explain)

    result = process_job(make_schedule_explanation_envelope("schedule-key-1"))

    assert result == {"status": "completed"}
    assert captured_request == {
        "reason_code": "placed_in_earliest_valid_window",
        "deterministic_reason": "Task was placed in the earliest valid window.",
        "facts": {
            "task_title": "Reply to inbox",
            "scheduled_start_at": "2026-07-12T09:00:00+02:00",
        },
    }
    cached = json.loads(redis.get(f"{RESULT_PREFIX}schedule-explanation:v1:decision-1"))
    assert cached["result"]["status"] == "explained"
    assert cached["result"]["explanation"] == "The cached wording."
    assert "idempotency" not in json.dumps(captured_request).lower()
    assert "result_cache_key" not in json.dumps(captured_request)


def test_schedule_explanation_job_caches_ai_disabled_fallback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    redis = fakeredis.FakeRedis()
    monkeypatch.setattr(jobs, "_current_redis", lambda: redis)
    monkeypatch.setattr(jobs, "Settings", lambda: FakeSettings(None))

    result = process_job(make_schedule_explanation_envelope("schedule-key-1"))

    assert result == {"status": "completed"}
    cached = json.loads(redis.get(f"{RESULT_PREFIX}schedule-explanation:v1:decision-1"))
    assert cached["result"]["status"] == "fallback"
    assert cached["result"]["fallback_reason"] == "ai_disabled"
    assert cached["result"]["error_code"] == "ai_disabled"


def test_schedule_explanation_job_invalid_cache_key_is_permanent_failure(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    redis = fakeredis.FakeRedis()
    monkeypatch.setattr(jobs, "_current_redis", lambda: redis)
    monkeypatch.setattr(jobs, "Settings", lambda: FakeSettings(None))
    caplog.set_level(logging.INFO, logger="worker_service")

    result = process_job(
        make_schedule_explanation_envelope(
            "schedule-key-1",
            result_cache_key="api-owned:decision-1",
        )
    )
    retry = process_job(make_schedule_explanation_envelope("schedule-key-1"))

    assert result == {"status": "permanent_failure"}
    assert retry == {"status": "duplicate"}
    failure = json.loads(redis.get(f"{OBSERVATION_PREFIX}failures:schedule-key-1"))
    assert failure["failure_type"] == "permanent"
    assert redis.get("api-owned:decision-1") is None
    assert {record.event for record in caplog.records} >= {
        "worker_job_permanent_failed"
    }


def make_test_job_envelope(
    idempotency_key: str,
    effect_key: str,
    outcome: str = "success",
) -> dict[str, object]:
    return {
        "contract_version": 1,
        "kind": "test_job",
        "idempotency_key": idempotency_key,
        "payload": {
            "effect_key": effect_key,
            "message": "ok",
            "outcome": outcome,
        },
    }


def make_schedule_explanation_envelope(
    idempotency_key: str,
    *,
    result_cache_key: str = f"{RESULT_PREFIX}schedule-explanation:v1:decision-1",
) -> dict[str, object]:
    return {
        "contract_version": 1,
        "kind": "schedule_explanation_enrichment",
        "idempotency_key": idempotency_key,
        "payload": {
            "decision_id": "decision-1",
            "reason_code": "placed_in_earliest_valid_window",
            "deterministic_reason": "Task was placed in the earliest valid window.",
            "facts": {
                "task_title": "Reply to inbox",
                "scheduled_start_at": "2026-07-12T09:00:00+02:00",
            },
            "result_cache_key": result_cache_key,
        },
    }


class FakeSettings:
    def __init__(self, ai_service_base_url: str | None) -> None:
        self.ai_service_base_url = ai_service_base_url
