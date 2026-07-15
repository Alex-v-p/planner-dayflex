"""Optional RQ producer/cache boundary for non-critical worker jobs."""

from __future__ import annotations

import json
import logging
from typing import Protocol

from redis import Redis
from redis.exceptions import RedisError
from rq import Queue, Retry
from rq.serializers import JSONSerializer

from api_service.contracts.worker_jobs import ScheduleExplanationJobEnvelope
from api_service.infrastructure.ai_client import ExplainScheduleDecisionResultDTO


LOGGER = logging.getLogger("api_service")
QUEUE_NAME = "planner-dayflex-worker"
SCHEDULE_EXPLANATION_RESULT_PREFIX = "worker:results:schedule-explanation:v1:"
REDIS_CONNECT_TIMEOUT_SECONDS = 0.25
REDIS_SOCKET_TIMEOUT_SECONDS = 0.5


class WorkerQueueClient(Protocol):
    """Port for optional non-critical background work."""

    def enqueue_schedule_explanation(
        self, envelope: ScheduleExplanationJobEnvelope
    ) -> None:
        """Queue explanation enrichment without affecting the caller."""

    def get_schedule_explanation_result(
        self, decision_id: str
    ) -> ExplainScheduleDecisionResultDTO | None:
        """Return a cached worker result when one is available."""


class DisabledWorkerQueueClient:
    """No-op queue client used when Redis is not configured."""

    def enqueue_schedule_explanation(
        self, envelope: ScheduleExplanationJobEnvelope
    ) -> None:
        _ = envelope

    def get_schedule_explanation_result(
        self, decision_id: str
    ) -> ExplainScheduleDecisionResultDTO | None:
        _ = decision_id
        return None


class RqWorkerQueueClient:
    """Redis/RQ producer for optional worker jobs."""

    def __init__(self, redis_url: str, queue_name: str = QUEUE_NAME) -> None:
        self._redis = Redis.from_url(
            redis_url,
            socket_connect_timeout=REDIS_CONNECT_TIMEOUT_SECONDS,
            socket_timeout=REDIS_SOCKET_TIMEOUT_SECONDS,
        )
        self._queue = Queue(
            queue_name,
            connection=self._redis,
            serializer=JSONSerializer,
        )

    def enqueue_schedule_explanation(
        self, envelope: ScheduleExplanationJobEnvelope
    ) -> None:
        try:
            self._queue.enqueue(
                "worker_service.application.jobs.process_job",
                envelope.model_dump(mode="json"),
                job_id=envelope.idempotency_key,
                retry=Retry(max=2, interval=[5, 30]),
                result_ttl=3600,
                failure_ttl=86400,
            )
        except RedisError:
            LOGGER.warning(
                "Worker queue unavailable",
                extra={"event": "worker_queue_unavailable"},
            )

    def get_schedule_explanation_result(
        self, decision_id: str
    ) -> ExplainScheduleDecisionResultDTO | None:
        try:
            value = self._redis.get(schedule_explanation_result_key(decision_id))
        except RedisError:
            LOGGER.warning(
                "Worker queue unavailable",
                extra={"event": "worker_queue_unavailable"},
            )
            return None
        if value is None:
            return None
        try:
            raw_payload = value.decode() if isinstance(value, bytes) else value
            payload = json.loads(raw_payload)
            if isinstance(payload, dict) and "result" in payload:
                payload = payload["result"]
            return ExplainScheduleDecisionResultDTO.model_validate(payload)
        except (TypeError, ValueError):
            LOGGER.warning(
                "Worker queue unavailable",
                extra={"event": "worker_queue_unavailable"},
            )
            return None


def schedule_explanation_result_key(decision_id: str) -> str:
    """Build the non-durable Redis cache key for one decision explanation."""
    return f"{SCHEDULE_EXPLANATION_RESULT_PREFIX}{decision_id}"
