"""Explicit versioned worker job contracts."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter


WORKER_JOB_CONTRACT_VERSION = 1
SUPPORTED_JOB_KINDS = {
    "test_job",
    "schedule_explanation_enrichment",
    "cleanup_stale_observations",
}


class TestJobPayload(BaseModel):
    """Test-only worker job payload with a visible Redis effect."""

    model_config = ConfigDict(extra="forbid")

    effect_key: str = Field(min_length=1, max_length=120)
    message: str = Field(min_length=1, max_length=120)
    outcome: Literal["success", "retryable_failure", "permanent_failure"] = "success"


class ScheduleExplanationJobPayload(BaseModel):
    """Approved schedule facts for non-critical explanation enrichment."""

    model_config = ConfigDict(extra="forbid")

    decision_id: str = Field(min_length=1, max_length=80)
    reason_code: str = Field(min_length=1, max_length=80)
    deterministic_reason: str = Field(min_length=1, max_length=500)
    facts: dict[str, object]
    result_cache_key: str = Field(min_length=1, max_length=200)


class CleanupStaleObservationsPayload(BaseModel):
    """Remove stale worker-owned observation and cache keys."""

    model_config = ConfigDict(extra="forbid")

    older_than_seconds: int = Field(gt=0, le=604800)


class WorkerJobEnvelope(BaseModel):
    """Stable JSON job envelope accepted by the worker."""

    model_config = ConfigDict(extra="forbid")

    contract_version: Literal[1] = WORKER_JOB_CONTRACT_VERSION
    kind: Literal[
        "test_job",
        "schedule_explanation_enrichment",
        "cleanup_stale_observations",
    ]
    idempotency_key: str = Field(min_length=1, max_length=200)
    correlation_id: str | None = Field(default=None, min_length=8, max_length=80)
    payload: dict[str, object]


def parse_test_payload(payload: dict[str, object]) -> TestJobPayload:
    """Validate a test job payload."""
    return TestJobPayload.model_validate(payload)


def parse_schedule_explanation_payload(
    payload: dict[str, object],
) -> ScheduleExplanationJobPayload:
    """Validate a schedule explanation job payload."""
    return ScheduleExplanationJobPayload.model_validate(payload)


def parse_cleanup_payload(
    payload: dict[str, object],
) -> CleanupStaleObservationsPayload:
    """Validate a cleanup job payload."""
    return CleanupStaleObservationsPayload.model_validate(payload)


JobEnvelopeAdapter = TypeAdapter(WorkerJobEnvelope)
