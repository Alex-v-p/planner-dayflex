"""CLI entry point for the RQ worker process."""

from __future__ import annotations

from redis import Redis
from rq import Queue, Worker
from rq.serializers import JSONSerializer

from worker_service.config import Settings
from worker_service.logging_config import configure_logging


def main() -> None:
    """Start the non-critical RQ worker."""
    settings = Settings()
    logger = configure_logging(settings.log_level)
    connection = Redis.from_url(settings.redis_url_value)
    queue = Queue(
        settings.queue_name,
        connection=connection,
        serializer=JSONSerializer,
    )
    logger.info("Worker started", extra={"event": "worker_started"})
    Worker([queue], connection=connection, serializer=JSONSerializer).work()


if __name__ == "__main__":
    main()
