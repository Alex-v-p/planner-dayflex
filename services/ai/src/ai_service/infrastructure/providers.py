"""Provider adapters for optional natural-language parsing."""

from __future__ import annotations

import re
from datetime import date, datetime, time
from zoneinfo import ZoneInfo

from ai_service.application.parsing import ParseProvider
from ai_service.contracts.explanations import (
    ExplainScheduleDecisionRequestDTO,
    ExplainScheduleDecisionResultDTO,
    ExplanationStatus,
    ScheduleReasonCode,
    explanation_fallback,
)
from ai_service.contracts.parsing import (
    FallbackReason,
    InterruptionProposalDTO,
    ParseInterruptionRequestDTO,
    ParseInterruptionResultDTO,
    ParseStatus,
    ParseTaskRequestDTO,
    ParseTaskResultDTO,
    TaskProposalDTO,
    interruption_fallback,
    task_fallback,
)
from ai_service.infrastructure.config import AiProvider, Settings


class DisabledProvider:
    """Provider implementation used when AI parsing is disabled."""

    def parse_task(self, request: ParseTaskRequestDTO) -> ParseTaskResultDTO:
        return task_fallback(FallbackReason.AI_DISABLED, "ai_disabled")

    def parse_interruption(
        self, request: ParseInterruptionRequestDTO
    ) -> ParseInterruptionResultDTO:
        return interruption_fallback(FallbackReason.AI_DISABLED, "ai_disabled")

    def explain_schedule_decision(
        self, request: ExplainScheduleDecisionRequestDTO
    ) -> ExplainScheduleDecisionResultDTO:
        return explanation_fallback(FallbackReason.AI_DISABLED, "ai_disabled")


class MockProvider:
    """Deterministic provider for tests and local smoke checks."""

    def parse_task(self, request: ParseTaskRequestDTO) -> ParseTaskResultDTO:
        text = request.text.strip()
        lowered = text.lower()
        if _looks_unparseable(lowered):
            return task_fallback(FallbackReason.UNABLE_TO_PARSE, "unable_to_parse")

        estimated_minutes = _duration_minutes(lowered)
        priority = _priority(lowered)
        due_date = _due_date(lowered, request.local_date)
        earliest_start_at = _first_local_time(
            lowered, request.local_date, request.time_zone
        )
        title = _task_title(text)

        if title is None and estimated_minutes is None and priority is None:
            return task_fallback(FallbackReason.UNABLE_TO_PARSE, "unable_to_parse")

        return ParseTaskResultDTO(
            status=ParseStatus.SUGGESTED,
            confidence=0.72,
            proposed_fields=TaskProposalDTO(
                title=title,
                estimated_minutes=estimated_minutes,
                priority=priority,
                due_date=due_date,
                earliest_start_at=earliest_start_at,
                splitting_allowed=None,
                min_segment_minutes=None,
            ),
            fallback_reason=None,
            error_code=None,
        )

    def parse_interruption(
        self, request: ParseInterruptionRequestDTO
    ) -> ParseInterruptionResultDTO:
        text = request.text.strip()
        lowered = text.lower()
        if _looks_unparseable(lowered):
            return interruption_fallback(
                FallbackReason.UNABLE_TO_PARSE, "unable_to_parse"
            )

        interval = _time_interval(lowered, request.local_date, request.time_zone)
        if interval is None:
            return interruption_fallback(
                FallbackReason.UNABLE_TO_PARSE, "unable_to_parse"
            )

        start_at, end_at = interval
        return ParseInterruptionResultDTO(
            status=ParseStatus.SUGGESTED,
            confidence=0.74,
            proposed_fields=InterruptionProposalDTO(
                start_at=start_at,
                end_at=end_at,
                time_zone=request.time_zone,
                reported_at=start_at,
            ),
            fallback_reason=None,
            error_code=None,
        )

    def explain_schedule_decision(
        self, request: ExplainScheduleDecisionRequestDTO
    ) -> ExplainScheduleDecisionResultDTO:
        subject = request.facts.task_title or "The plan"
        explanation = _mock_explanation(request.reason_code, subject)
        return ExplainScheduleDecisionResultDTO(
            status=ExplanationStatus.EXPLAINED,
            confidence=0.7,
            explanation=explanation,
            fallback_reason=None,
            error_code=None,
        )


class ExternalProvider:
    """Placeholder external provider adapter without a live SDK dependency."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def parse_task(self, request: ParseTaskRequestDTO) -> ParseTaskResultDTO:
        return task_fallback(FallbackReason.PROVIDER_ERROR, "provider_not_configured")

    def parse_interruption(
        self, request: ParseInterruptionRequestDTO
    ) -> ParseInterruptionResultDTO:
        return interruption_fallback(
            FallbackReason.PROVIDER_ERROR, "provider_not_configured"
        )

    def explain_schedule_decision(
        self, request: ExplainScheduleDecisionRequestDTO
    ) -> ExplainScheduleDecisionResultDTO:
        return explanation_fallback(
            FallbackReason.PROVIDER_ERROR, "provider_not_configured"
        )


def provider_from_settings(settings: Settings) -> ParseProvider:
    """Build the configured provider while preserving disabled fallback behavior."""
    if not settings.provider_enabled or settings.provider is AiProvider.DISABLED:
        return DisabledProvider()
    if settings.provider is AiProvider.MOCK:
        return MockProvider()
    return ExternalProvider(settings)


def _mock_explanation(reason_code: ScheduleReasonCode, subject: str) -> str:
    match reason_code:
        case ScheduleReasonCode.PLACED_IN_EARLIEST_VALID_WINDOW:
            return (
                f"{subject} landed in the first open window that satisfied "
                "the saved schedule rules."
            )
        case ScheduleReasonCode.MOVED_AFTER_INTERRUPTION:
            return (
                f"{subject} moved because reported unavailable time changed "
                "what could still happen next."
            )
        case ScheduleReasonCode.SPLIT_ACROSS_AVAILABLE_WINDOWS:
            return (
                f"{subject} was divided only because splitting is allowed and "
                "the available windows can hold useful pieces."
            )
        case ScheduleReasonCode.BLOCKED_BY_FIXED_EVENT:
            return (
                f"{subject} did not fit because fixed events already reserve "
                "the relevant time."
            )
        case ScheduleReasonCode.BLOCKED_BY_INTERRUPTION:
            return (
                f"{subject} did not fit because reported unavailable time "
                "reserves the relevant time."
            )
        case ScheduleReasonCode.MISSED_BEFORE_CURRENT_TIME:
            return (
                f"{subject} was reconsidered because its earlier planned time "
                "had already passed."
            )
        case ScheduleReasonCode.INSUFFICIENT_TIME_BEFORE_DEADLINE:
            return (
                f"{subject} did not fit because the remaining valid time "
                "before its due date was too short."
            )
        case ScheduleReasonCode.INSUFFICIENT_REMAINING_DAY_TIME:
            return (
                f"{subject} did not fit because the remaining day did not "
                "have enough usable time."
            )
        case ScheduleReasonCode.DESIGNATED_FREE_TIME:
            return (
                "A useful open window was kept visible as free time instead "
                "of being hidden."
            )
        case ScheduleReasonCode.LOCKED_TIME_OVERLAP_MERGED:
            return (
                "Overlapping unavailable blocks were counted once so the plan "
                "does not double-count lost time."
            )


def _looks_unparseable(lowered: str) -> bool:
    return any(term in lowered for term in ("ambiguous", "unable", "???"))


def _duration_minutes(lowered: str) -> int | None:
    hour_match = re.search(r"\b(\d{1,2})\s*(?:h|hr|hour|hours)\b", lowered)
    minute_match = re.search(r"\b(\d{1,4})\s*(?:m|min|minute|minutes)\b", lowered)
    total = 0
    if hour_match is not None:
        total += int(hour_match.group(1)) * 60
    if minute_match is not None:
        total += int(minute_match.group(1))
    if total > 0:
        return min(total, 1440)
    plain = re.search(r"\bfor\s+(\d{1,4})\b", lowered)
    return min(int(plain.group(1)), 1440) if plain is not None else None


def _priority(lowered: str) -> int | None:
    explicit = re.search(r"\bpriority\s*([1-5])\b", lowered)
    if explicit is not None:
        return int(explicit.group(1))
    if any(term in lowered for term in ("urgent", "important", "high priority")):
        return 5
    if "low priority" in lowered:
        return 2
    return None


def _due_date(lowered: str, local_date: date | None) -> date | None:
    if local_date is None:
        return None
    if "today" in lowered:
        return local_date
    tomorrow = re.search(r"\btomorrow\b", lowered)
    if tomorrow is not None:
        return date.fromordinal(local_date.toordinal() + 1)
    return None


def _task_title(text: str) -> str | None:
    cleaned = re.sub(
        r"\b(priority\s*[1-5]|urgent|important|low priority|high priority)\b",
        "",
        text,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(
        r"\b(for\s+)?\d{1,4}\s*(h|hr|hour|hours|m|min|minute|minutes)\b",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(r"\b(today|tomorrow)\b", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(
        r"\b(after|at)\s+\d{1,2}(?::\d{2})?\b",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(r"\s+", " ", cleaned)
    cleaned = cleaned.strip(" -.,")
    return cleaned[:200] if cleaned else None


def _first_local_time(
    lowered: str, local_date: date | None, time_zone: str | None
) -> datetime | None:
    match = re.search(r"\b(?:at|after)\s+(\d{1,2})(?::(\d{2}))?\b", lowered)
    if match is None or local_date is None or time_zone is None:
        return None
    return _local_datetime(local_date, time_zone, int(match.group(1)), match.group(2))


def _time_interval(
    lowered: str, local_date: date | None, time_zone: str | None
) -> tuple[datetime, datetime] | None:
    if local_date is None or time_zone is None:
        return None
    match = re.search(
        r"\b(?:from\s+)?(\d{1,2})(?::(\d{2}))?\s*(?:-|to)\s*(\d{1,2})(?::(\d{2}))?\b",
        lowered,
    )
    if match is None:
        return None
    start = _local_datetime(local_date, time_zone, int(match.group(1)), match.group(2))
    end = _local_datetime(local_date, time_zone, int(match.group(3)), match.group(4))
    if end <= start:
        return None
    return start, end


def _local_datetime(
    local_date: date, time_zone: str, hour: int, minute_text: str | None
) -> datetime:
    minute = int(minute_text or "0")
    return datetime.combine(
        local_date,
        time(hour=hour, minute=minute),
        ZoneInfo(time_zone),
    )
