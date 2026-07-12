"""RQ job entry points for non-critical background work."""

from __future__ import annotations

import logging

from pydantic import ValidationError
from redis import Redis
from redis.exceptions import RedisError
from rq import get_current_job

from worker_service.correlation import safe_request_id, set_request_id
from worker_service.config import Settings
from worker_service.contracts.jobs import (
    JobEnvelopeAdapter,
    parse_cleanup_payload,
    parse_schedule_explanation_payload,
    parse_test_payload,
)
from worker_service.infrastructure.ai_client import explain_schedule_decision
from worker_service.infrastructure.observations import ObservationStore


LOGGER = logging.getLogger("worker_service")


class RetryableWorkerJobError(Exception):
    """Raised when RQ should retry a transient job failure."""


class PermanentWorkerJobError(Exception):
    """Raised for contract or non-retryable job failures."""


def process_job(raw_envelope: dict[str, object]) -> dict[str, object]:
    """Validate and process one versioned JSON job envelope."""
    try:
        envelope = JobEnvelopeAdapter.validate_python(raw_envelope)
    except ValidationError:
        LOGGER.error(
            "Permanent worker job failure",
            extra={"event": "worker_job_permanent_failed"},
        )
        return {"status": "permanent_failure"}

    if envelope.correlation_id is not None:
        set_request_id(safe_request_id(envelope.correlation_id))

    try:
        store = ObservationStore(_current_redis())
        claimed = False

        try:
            if not store.claim(envelope.idempotency_key):
                LOGGER.info(
                    "Duplicate worker job skipped",
                    extra={"event": "worker_job_duplicate"},
                )
                return {"status": "duplicate"}
            claimed = True

            if envelope.kind == "test_job":
                return _process_test_job(
                    envelope.idempotency_key, envelope.payload, store
                )
            if envelope.kind == "schedule_explanation_enrichment":
                return _process_schedule_explanation(envelope.payload, store)
            if envelope.kind == "cleanup_stale_observations":
                return _process_cleanup(envelope.payload, store)
            raise PermanentWorkerJobError("unsupported job kind")
        except RetryableWorkerJobError:
            if claimed:
                store.release_claim(envelope.idempotency_key)
            raise
        except RedisError as exc:
            if claimed:
                _release_claim_safely(store, envelope.idempotency_key)
            LOGGER.warning(
                "Retryable worker job failure",
                extra={"event": "worker_job_retryable_failed"},
            )
            raise RetryableWorkerJobError("retryable worker job failure") from exc
        except (PermanentWorkerJobError, ValidationError, ValueError):
            store.record_failure(envelope.idempotency_key, "permanent")
            LOGGER.error(
                "Permanent worker job failure",
                extra={"event": "worker_job_permanent_failed"},
            )
            return {"status": "permanent_failure"}
    finally:
        set_request_id(None)


def _process_test_job(
    idempotency_key: str, payload: dict[str, object], store: ObservationStore
) -> dict[str, object]:
    test_payload = parse_test_payload(payload)
    if test_payload.outcome == "retryable_failure":
        store.record_failure(idempotency_key, "retryable")
        LOGGER.warning(
            "Retryable worker job failure",
            extra={"event": "worker_job_retryable_failed"},
        )
        raise RetryableWorkerJobError("retryable worker job failure")
    if test_payload.outcome == "permanent_failure":
        store.record_failure(idempotency_key, "permanent")
        LOGGER.error(
            "Permanent worker job failure",
            extra={"event": "worker_job_permanent_failed"},
        )
        return {"status": "permanent_failure"}

    store.record_test_effect(test_payload.effect_key, test_payload.message)
    LOGGER.info("Worker job completed", extra={"event": "worker_job_completed"})
    return {"status": "completed"}


def _process_schedule_explanation(
    payload: dict[str, object], store: ObservationStore
) -> dict[str, object]:
    explanation_payload = parse_schedule_explanation_payload(payload)
    settings = Settings()
    result = explain_schedule_decision(
        str(settings.ai_service_base_url) if settings.ai_service_base_url else None,
        {
            "reason_code": explanation_payload.reason_code,
            "deterministic_reason": explanation_payload.deterministic_reason,
            "facts": explanation_payload.facts,
        },
    )
    store.cache_result(explanation_payload.result_cache_key, result)
    LOGGER.info("Worker job completed", extra={"event": "worker_job_completed"})
    return {"status": "completed"}


def _process_cleanup(
    payload: dict[str, object], store: ObservationStore
) -> dict[str, object]:
    cleanup_payload = parse_cleanup_payload(payload)
    removed = store.cleanup_stale(cleanup_payload.older_than_seconds)
    LOGGER.info("Worker cleanup completed", extra={"event": "worker_cleanup_completed"})
    return {"status": "completed", "removed": removed}


def _release_claim_safely(store: ObservationStore, idempotency_key: str) -> None:
    try:
        store.release_claim(idempotency_key)
    except RedisError:
        LOGGER.warning(
            "Retryable worker job failure",
            extra={"event": "worker_job_retryable_failed"},
        )


def _current_redis() -> Redis:
    current_job = get_current_job()
    if current_job is not None:
        return current_job.connection
    return Redis.from_url(Settings().redis_url_value)
