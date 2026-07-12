"""Architecture boundary guards for optional AI parsing."""

from __future__ import annotations

from pathlib import Path


API_ROOT = Path(__file__).parents[1] / "src" / "api_service"
FORBIDDEN_PROVIDER_TERMS = (
    "openai",
    "anthropic",
    "ollama",
    "PLANNER_AI_PROVIDER_CREDENTIAL",
    "provider_credential",
)


def test_api_service_does_not_import_provider_sdks_or_credentials() -> None:
    offenders: list[str] = []
    for path in API_ROOT.rglob("*.py"):
        contents = path.read_text(encoding="utf-8")
        matched = [term for term in FORBIDDEN_PROVIDER_TERMS if term in contents]
        if matched:
            offenders.append(f"{path.relative_to(API_ROOT)}: {', '.join(matched)}")

    assert offenders == []
