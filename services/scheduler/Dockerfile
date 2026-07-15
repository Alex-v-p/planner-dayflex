FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /workspace/services/scheduler

COPY packages/scheduler-core /workspace/packages/scheduler-core
COPY services/scheduler/pyproject.toml services/scheduler/README.md ./
COPY services/scheduler/src ./src

RUN pip install --no-cache-dir ../../packages/scheduler-core \
    && pip install --no-cache-dir .

EXPOSE 8001

CMD ["uvicorn", "scheduler_service.app:app", "--host", "0.0.0.0", "--port", "8001"]
