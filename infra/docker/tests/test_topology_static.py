from __future__ import annotations

import re
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
COMPOSE = REPO_ROOT / "infra" / "compose.yml"
NGINX = REPO_ROOT / "infra" / "nginx" / "default.conf"
ENV_EXAMPLE = REPO_ROOT / "infra" / "docker" / ".env.example"
CI = REPO_ROOT / ".github" / "workflows" / "ci.yml"
DOCKER_SCRIPTS = REPO_ROOT / "infra" / "docker"

CORE_SERVICES = (
    "edge",
    "web",
    "api",
    "scheduler",
    "ai",
    "worker",
    "postgres",
    "redis",
)


def _service_block(compose_text: str, service_name: str) -> str:
    match = re.search(
        rf"^  {re.escape(service_name)}:\n(?P<body>(?:    .*\n|      .*\n|        .*\n|          .*\n|            .*\n|              .*\n)+)",
        compose_text,
        re.MULTILINE,
    )
    assert match is not None, f"{service_name} service is missing"
    return match.group("body")


def test_only_edge_publishes_a_host_port() -> None:
    compose_text = COMPOSE.read_text(encoding="utf-8")
    services = [*CORE_SERVICES, "ollama"]

    assert "ports:" in _service_block(compose_text, "edge")
    assert "127.0.0.1:${PLANNER_EDGE_PORT:-8080}:8080" in _service_block(
        compose_text, "edge"
    )
    for service in services:
        if service == "edge":
            continue
        assert "ports:" not in _service_block(compose_text, service)


def test_internal_networks_are_marked_internal() -> None:
    compose_text = COMPOSE.read_text(encoding="utf-8")
    for network in ("app_internal", "data", "queue", "ai_model"):
        assert re.search(
            rf"^  {network}:\n    internal: true$", compose_text, re.MULTILINE
        ), f"{network} must be internal"


def test_core_services_and_model_runtime_declare_healthchecks() -> None:
    compose_text = COMPOSE.read_text(encoding="utf-8")
    healthcheck_expectations = {
        "edge": "http://127.0.0.1:8080/edge-health",
        "web": "http://127.0.0.1:8080/health",
        "api": "http://127.0.0.1:8000/health",
        "scheduler": "http://127.0.0.1:8001/health",
        "ai": "http://127.0.0.1:8002/health",
        "worker": "PLANNER_WORKER_REDIS_URL",
        "postgres": "pg_isready",
        "redis": "redis-cli",
        "ollama": "ollama",
    }

    for service, probe in healthcheck_expectations.items():
        block = _service_block(compose_text, service)
        assert "healthcheck:" in block, f"{service} must declare a healthcheck"
        assert "test:" in block, f"{service} healthcheck must define a test command"
        assert probe in block, f"{service} healthcheck must probe {probe}"


def test_browser_edge_routes_only_web_and_api() -> None:
    nginx_text = NGINX.read_text(encoding="utf-8")
    assert "location /api/" in nginx_text
    assert "proxy_pass http://planner_api/" in nginx_text
    assert "proxy_pass http://planner_web" in nginx_text

    forbidden_targets = ("scheduler", "ai", "worker", "redis", "postgres", "ollama")
    for target in forbidden_targets:
        assert target not in nginx_text


def test_model_runtime_is_profile_gated_and_ai_only() -> None:
    compose_text = COMPOSE.read_text(encoding="utf-8")
    ollama_block = _service_block(compose_text, "ollama")
    assert "profiles:" in ollama_block
    assert "- model" in ollama_block

    for service in ("edge", "web", "api", "scheduler", "worker", "postgres", "redis"):
        assert "ai_model" not in _service_block(compose_text, service)
    assert "ai_model" in _service_block(compose_text, "ai")
    assert "ai_model" in ollama_block


def test_optional_services_are_not_pulled_by_required_services() -> None:
    compose_text = COMPOSE.read_text(encoding="utf-8")
    for service in ("api", "worker"):
        service_block = _service_block(compose_text, service)
        depends_on_section = service_block.split("environment:", maxsplit=1)[0]
        assert "ai:" not in depends_on_section


def test_helper_scripts_use_committed_env_template_and_selected_stack() -> None:
    assert ENV_EXAMPLE.exists(), "documented helper default env template is missing"

    required_scripts = (
        "validate-compose.ps1",
        "build-images.ps1",
        "smoke-local.ps1",
        "cleanup-local.ps1",
    )
    for script_name in required_scripts:
        script_text = (DOCKER_SCRIPTS / script_name).read_text(encoding="utf-8")
        assert "$PSScriptRoot/.env.example" in script_text
        assert "../compose.yml" in script_text

    smoke_text = (DOCKER_SCRIPTS / "smoke-local.ps1").read_text(encoding="utf-8")
    assert "up --build --wait -d edge web api scheduler ai worker postgres redis" in (
        smoke_text
    )
    assert "/edge-health" in smoke_text
    assert "/api/health" in smoke_text
    assert "/scheduler/health" in smoke_text
    assert "API database connection check failed" in smoke_text
    assert "Worker Redis connection check failed" in smoke_text
    assert "HostConfig.PortBindings" in smoke_text


def test_optional_service_disabled_smoke_exercises_reduced_stack() -> None:
    optional_smoke = DOCKER_SCRIPTS / "tests" / "smoke-optional-services-disabled.ps1"
    script_text = optional_smoke.read_text(encoding="utf-8")

    assert "up --build --wait -d edge web api scheduler postgres redis" in script_text
    assert "ai" in script_text
    assert "worker" in script_text
    assert "Optional service $disabledService started" in script_text
    assert "/api/health" in script_text
    assert "http://127.0.0.1:8001/health" in script_text


def test_local_compose_checks_run_on_pull_requests() -> None:
    ci_text = CI.read_text(encoding="utf-8")

    assert "pull_request:" in ci_text
    assert "local-compose-topology:" in ci_text
    assert "python infra/docker/tests/test_topology_static.py" in ci_text
    assert "./infra/docker/validate-compose.ps1" in ci_text
    assert "./infra/docker/build-images.ps1" in ci_text
    assert "./infra/docker/smoke-local.ps1" in ci_text
    assert "./infra/docker/tests/smoke-optional-services-disabled.ps1" in ci_text


def test_committed_topology_files_do_not_include_provider_api_secrets() -> None:
    checked_files = [
        COMPOSE,
        ENV_EXAMPLE,
        NGINX,
        *DOCKER_SCRIPTS.glob("*.ps1"),
    ]
    forbidden_patterns = (
        "OPENAI_API_KEY=",
        "ANTHROPIC_API_KEY=",
        "PLANNER_AI_PROVIDER_API_KEY=",
        "PLANNER_API_SECRET_KEY=",
        "JWT_SECRET=",
    )

    for path in checked_files:
        text = path.read_text(encoding="utf-8")
        for pattern in forbidden_patterns:
            assert pattern not in text, f"{path} includes committed secret key material"


if __name__ == "__main__":
    test_only_edge_publishes_a_host_port()
    test_internal_networks_are_marked_internal()
    test_core_services_and_model_runtime_declare_healthchecks()
    test_browser_edge_routes_only_web_and_api()
    test_model_runtime_is_profile_gated_and_ai_only()
    test_optional_services_are_not_pulled_by_required_services()
    test_helper_scripts_use_committed_env_template_and_selected_stack()
    test_optional_service_disabled_smoke_exercises_reduced_stack()
    test_local_compose_checks_run_on_pull_requests()
    test_committed_topology_files_do_not_include_provider_api_secrets()
