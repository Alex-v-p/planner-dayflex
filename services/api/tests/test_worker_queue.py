"""API worker queue producer and cache adapter tests."""

from __future__ import annotations

import json
import logging
from io import StringIO
from typing import Any

import pytest

from api_service.contracts.worker_jobs import (
    ScheduleExplanationJobEnvelope,
    ScheduleExplanationJobPayload,
)
from api_service.infrastructure import worker_queue
from api_service.infrastructure.worker_queue import (
    RqWorkerQueueClient,
    schedule_explanation_result_key,
)


def test_rq_worker_queue_enqueues_versioned_schedule_explanation_contract(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    redis = FakeRedis()
    queue = CapturingQueue()
    captured_redis_kwargs: dict[str, Any] = {}

    def from_url(_url: str, **kwargs: Any) -> FakeRedis:
        captured_redis_kwargs.update(kwargs)
        return redis

    monkeypatch.setattr(worker_queue.Redis, "from_url", from_url)
    monkeypatch.setattr(
        worker_queue, "Queue", lambda *args, **kwargs: queue.capture(*args, **kwargs)
    )

    client = RqWorkerQueueClient("redis://:secret@redis.example.test:6379/0")
    envelope = make_schedule_explanation_envelope()

    client.enqueue_schedule_explanation(envelope)

    assert queue.init_args == ("planner-dayflex-worker",)
    assert queue.init_kwargs == {
        "connection": redis,
        "serializer": worker_queue.JSONSerializer,
    }
    assert queue.enqueued["func"] == "worker_service.application.jobs.process_job"
    assert (
        queue.enqueued["job_id"]
        == "schedule-explanation:v1:snapshot-1:decision-1:placed"
    )
    assert queue.enqueued["result_ttl"] == 3600
    assert queue.enqueued["failure_ttl"] == 86400
    assert queue.enqueued["retry"].max == 2
    assert queue.enqueued["retry"].intervals == [5, 30]
    assert queue.enqueued["args"][0] == envelope.model_dump(mode="json")
    assert captured_redis_kwargs == {
        "socket_connect_timeout": worker_queue.REDIS_CONNECT_TIMEOUT_SECONDS,
        "socket_timeout": worker_queue.REDIS_SOCKET_TIMEOUT_SECONDS,
    }


def test_rq_worker_queue_reads_wrapped_cached_result(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    redis = FakeRedis()
    redis.set(
        schedule_explanation_result_key("decision-1"),
        json.dumps(
            {
                "recorded_at": "2026-07-12T08:00:00+00:00",
                "result": {
                    "status": "explained",
                    "confidence": 0.7,
                    "explanation": "A safe cached explanation.",
                    "fallback_reason": None,
                    "error_code": None,
                },
            }
        ),
    )
    monkeypatch.setattr(worker_queue.Redis, "from_url", lambda *args, **kwargs: redis)
    monkeypatch.setattr(worker_queue, "Queue", lambda *args, **kwargs: CapturingQueue())

    result = RqWorkerQueueClient(
        "redis://127.0.0.1:6379/0"
    ).get_schedule_explanation_result("decision-1")

    assert result is not None
    assert result.status == "explained"
    assert result.explanation == "A safe cached explanation."


def test_rq_worker_queue_invalid_cached_result_is_safe_and_redacted(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    redis = FakeRedis()
    redis.set(schedule_explanation_result_key("decision-1"), "{secret-token")
    monkeypatch.setattr(worker_queue.Redis, "from_url", lambda *args, **kwargs: redis)
    monkeypatch.setattr(worker_queue, "Queue", lambda *args, **kwargs: CapturingQueue())
    log_output = StringIO()
    handler = logging.StreamHandler(log_output)
    worker_queue.LOGGER.addHandler(handler)
    worker_queue.LOGGER.setLevel(logging.WARNING)

    try:
        result = RqWorkerQueueClient(
            "redis://127.0.0.1:6379/0"
        ).get_schedule_explanation_result("decision-1")
    finally:
        worker_queue.LOGGER.removeHandler(handler)

    assert result is None
    assert "Worker queue unavailable" in log_output.getvalue()
    assert "secret-token" not in log_output.getvalue()


def make_schedule_explanation_envelope() -> ScheduleExplanationJobEnvelope:
    return ScheduleExplanationJobEnvelope(
        idempotency_key="schedule-explanation:v1:snapshot-1:decision-1:placed",
        payload=ScheduleExplanationJobPayload(
            decision_id="decision-1",
            reason_code="placed_in_earliest_valid_window",
            deterministic_reason="Task was placed in the earliest valid window.",
            facts={
                "task_title": "Reply to inbox",
                "scheduled_start_at": "2026-07-12T09:00:00+02:00",
            },
            result_cache_key=schedule_explanation_result_key("decision-1"),
        ),
    )


class CapturingQueue:
    def __init__(self) -> None:
        self.init_args: tuple[Any, ...] = ()
        self.init_kwargs: dict[str, Any] = {}
        self.enqueued: dict[str, Any] = {}

    def capture(self, *args: Any, **kwargs: Any) -> "CapturingQueue":
        self.init_args = args
        self.init_kwargs = kwargs
        return self

    def enqueue(self, func: str, *args: Any, **kwargs: Any) -> None:
        self.enqueued = {"func": func, "args": args, **kwargs}


class FakeRedis:
    def __init__(self) -> None:
        self.values: dict[str, str] = {}

    def get(self, key: str) -> str | None:
        return self.values.get(key)

    def set(self, key: str, value: str) -> None:
        self.values[key] = value
