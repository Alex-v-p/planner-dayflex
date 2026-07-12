# planner-dayflex AI service

`services/ai` is the optional AI boundary for natural-language parsing and
schedule-decision wording. It owns all direct AI/provider communication and
exposes only internal HTTP contracts to the application API.

## Run locally

```bash
uv sync --locked
uv run uvicorn ai_service.app:app --host 127.0.0.1 --port 8002
```

`GET /health` is dependency-free liveness. A disabled or unavailable provider
does not make health fail.
`GET /ready` returns safe service readiness without exposing provider URLs,
model names, credentials, or provider error text.

The service accepts `X-Request-ID`, sanitizes unsafe values, returns the safe ID
in the response header, and includes it in structured JSON logs. Logs contain
only allowlisted operational event names; they do not include prompts, provider
payloads, request bodies, URLs, or credentials.

In the local Compose topology, the AI service is internal-only and runs with
the disabled provider by default. The optional Ollama runtime is enabled only
with the `model` profile and is reachable only from this AI service network.
No browser route points at AI or the model runtime.

## Configuration

All service-owned settings use the `PLANNER_AI_` prefix:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PLANNER_AI_PROVIDER_ENABLED` | `false` | Enables provider-backed parsing when true. |
| `PLANNER_AI_PROVIDER` | `disabled` | `disabled`, `mock`, or `external`. |
| `PLANNER_AI_MODEL` | `mock-parser-v1` | Provider model identifier. |
| `PLANNER_AI_PROVIDER_BASE_URL` | unset | Optional provider base URL. |
| `PLANNER_AI_PROVIDER_CREDENTIAL` | unset | Optional provider credential; never logged. |
| `PLANNER_AI_PROVIDER_TIMEOUT_SECONDS` | `2.0` | Bounded provider timeout, 0.1 to 10 seconds. |
| `PLANNER_AI_LOG_LEVEL` | `INFO` | Standard Python log level. |

The `mock` provider is deterministic and intended for tests and local smoke
checks. The `external` adapter is a placeholder and does not include a live SDK
dependency in this ticket.

## Contracts

- `POST /v1/parse-task`
- `POST /v1/parse-interruption`
- `POST /v1/explain-schedule-decision`

The parse endpoints return the shared parse result contract:

- `status`: `suggested` or `fallback`
- `confidence`: number from `0.0` to `1.0`
- `proposed_fields`: typed task or interruption proposal object
- `fallback_reason`: stable reason or `null`
- `error_code`: stable machine code or `null`

The schedule explanation endpoint accepts only approved structured scheduler
facts, the persisted reason code, and deterministic reason text from
`services/api`. It returns optional wording for that existing decision:

- `status`: `explained` or `fallback`
- `confidence`: number from `0.0` to `1.0`
- `explanation`: grounded wording or `null`
- `fallback_reason`: stable reason or `null`
- `error_code`: stable machine code or `null`

The AI service never changes schedules or decides where work belongs.
Schema errors return a safe 422 envelope and do not echo user text.

Data-model impact: None.

Service/container impact: TKT-025 keeps the existing local-only AI image and
adds internal Compose wiring. AI health remains liveness-only and does not
check provider/model availability. TKT-026 adds readiness and correlation
behavior without changing the service topology.
