"""Versioned background job contracts produced by the API service."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


WORKER_JOB_CONTRACT_VERSION = 1
SCHEDULE_EXPLANATION_JOB_KIND = "schedule_explanation_enrichment"
REQUEST_ID_PATTERN = r"^pdreq\.[0-9a-f]{32}$"


class ScheduleExplanationJobPayload(BaseModel):
    """Approved facts for non-critical schedule explanation enrichment."""

    model_config = ConfigDict(extra="forbid")

    decision_id: str = Field(min_length=1, max_length=80)
    reason_code: str = Field(min_length=1, max_length=80)
    deterministic_reason: str = Field(min_length=1, max_length=500)
    facts: dict[str, object]
    result_cache_key: str = Field(min_length=1, max_length=200)


class ScheduleExplanationJobEnvelope(BaseModel):
    """Stable API-to-worker job envelope."""

    model_config = ConfigDict(extra="forbid")

    contract_version: Literal[1] = WORKER_JOB_CONTRACT_VERSION
    kind: Literal["schedule_explanation_enrichment"] = SCHEDULE_EXPLANATION_JOB_KIND
    idempotency_key: str = Field(min_length=1, max_length=200)
    correlation_id: str | None = Field(
        default=None,
        pattern=REQUEST_ID_PATTERN,
        description="Optional canonical request ID: pdreq.<32 lowercase hex chars>.",
    )
    payload: ScheduleExplanationJobPayload
