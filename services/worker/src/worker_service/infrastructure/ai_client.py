"""HTTP adapter for optional AI schedule explanation wording."""

from __future__ import annotations

from typing import Any

import httpx


def explain_schedule_decision(
    base_url: str | None, request: dict[str, Any]
) -> dict[str, Any]:
    """Return AI wording or a safe fallback when the AI service is unavailable."""
    if base_url is None:
        return _fallback("ai_disabled", "ai_disabled")
    try:
        response = httpx.post(
            f"{base_url.rstrip('/')}/v1/explain-schedule-decision",
            json=request,
            timeout=2.0,
        )
    except httpx.TimeoutException:
        return _fallback("timeout", "ai_service_timeout")
    except httpx.HTTPError:
        return _fallback("service_unavailable", "ai_service_unavailable")
    if response.status_code >= 400:
        return _fallback("service_unavailable", "ai_service_non_success")
    try:
        payload = response.json()
    except ValueError:
        return _fallback("invalid_response", "ai_service_invalid_response")
    if not isinstance(payload, dict):
        return _fallback("invalid_response", "ai_service_invalid_response")
    return payload


def _fallback(reason: str, error_code: str) -> dict[str, Any]:
    return {
        "status": "fallback",
        "confidence": 0.0,
        "explanation": None,
        "fallback_reason": reason,
        "error_code": error_code,
    }
