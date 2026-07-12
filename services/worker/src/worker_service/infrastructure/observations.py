"""Redis-backed non-durable worker observation and cache state."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
import json
from typing import Any

from redis import Redis


IDEMPOTENCY_PREFIX = "worker:idempotency:"
OBSERVATION_PREFIX = "worker:observations:"
RESULT_PREFIX = "worker:results:"


class ObservationStore:
    """Small Redis state adapter for idempotency and observable test effects."""

    def __init__(self, redis: Redis) -> None:
        self._redis = redis

    def claim(self, idempotency_key: str, *, ttl_seconds: int = 86400) -> bool:
        """Return true only for the first delivery of an idempotency key."""
        return bool(
            self._redis.set(
                f"{IDEMPOTENCY_PREFIX}{idempotency_key}",
                _now_iso(),
                nx=True,
                ex=ttl_seconds,
            )
        )

    def release_claim(self, idempotency_key: str) -> None:
        """Allow a retryable failure to be delivered again."""
        self._redis.delete(f"{IDEMPOTENCY_PREFIX}{idempotency_key}")

    def record_test_effect(self, effect_key: str, message: str) -> None:
        """Record a visible effect used by tests."""
        key = f"{OBSERVATION_PREFIX}{effect_key}"
        self._redis.incrby(f"{key}:count", 1)
        self._redis.set(
            key,
            json.dumps(
                {"message": message, "recorded_at": _now_iso()},
                separators=(",", ":"),
                sort_keys=True,
            ),
        )

    def record_failure(self, idempotency_key: str, failure_type: str) -> None:
        """Record failure metadata without payload contents."""
        self._redis.set(
            f"{OBSERVATION_PREFIX}failures:{idempotency_key}",
            json.dumps(
                {"failure_type": failure_type, "recorded_at": _now_iso()},
                separators=(",", ":"),
                sort_keys=True,
            ),
        )

    def cache_result(self, key: str, result: dict[str, Any]) -> None:
        """Cache a non-durable worker result under a worker-owned prefix."""
        if not key.startswith(RESULT_PREFIX):
            raise ValueError("result cache key must use the worker results prefix")
        self._redis.set(
            key,
            json.dumps(
                {"recorded_at": _now_iso(), "result": result},
                separators=(",", ":"),
                sort_keys=True,
            ),
            ex=86400,
        )

    def cleanup_stale(self, older_than_seconds: int) -> int:
        """Delete stale worker-owned observation and cache entries."""
        cutoff = datetime.now(UTC) - timedelta(seconds=older_than_seconds)
        removed = 0
        for pattern in (f"{OBSERVATION_PREFIX}*", f"{RESULT_PREFIX}*"):
            for key in self._redis.scan_iter(match=pattern):
                key_text = key.decode() if isinstance(key, bytes) else str(key)
                value = self._redis.get(key_text)
                if value is None:
                    continue
                if _is_stale(value, cutoff):
                    removed += int(self._redis.delete(key_text))
        return removed


def _is_stale(value: bytes | str, cutoff: datetime) -> bool:
    try:
        raw = value.decode() if isinstance(value, bytes) else value
        payload = json.loads(raw)
        recorded_at = datetime.fromisoformat(payload["recorded_at"])
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        return False
    return recorded_at <= cutoff


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()
