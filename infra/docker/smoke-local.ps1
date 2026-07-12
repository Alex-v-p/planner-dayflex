param(
    [string]$ProjectName = "planner-dayflex-smoke",
    [string]$EnvFile = "$PSScriptRoot/.env.example",
    [int]$EdgePort = 8080,
    [switch]$KeepRunning
)

$ErrorActionPreference = "Stop"
$ComposeFile = Join-Path $PSScriptRoot "../compose.yml"
$ComposeExecutable = "docker"
$ComposePrefix = @("compose")
if (Get-Command docker-compose -ErrorAction SilentlyContinue) {
    $ComposeExecutable = "docker-compose"
    $ComposePrefix = @()
}

$compose = $ComposePrefix + @("--env-file", $EnvFile, "-f", $ComposeFile, "-p", $ProjectName)

try {
    & $ComposeExecutable @compose up --build --wait -d edge web api scheduler ai worker postgres redis
    if ($LASTEXITCODE -ne 0) {
        throw "Compose startup failed."
    }

    $edgeHealth = Invoke-RestMethod -Uri "http://127.0.0.1:$EdgePort/edge-health" -TimeoutSec 5
    if ($edgeHealth.status -ne "ok") {
        throw "Edge health returned unexpected status."
    }

    $apiHealth = Invoke-RestMethod -Uri "http://127.0.0.1:$EdgePort/api/health" -TimeoutSec 5
    if ($apiHealth.status -ne "ok") {
        throw "API health through edge returned unexpected status."
    }

    try {
        $internalProbe = Invoke-WebRequest `
            -Uri "http://127.0.0.1:$EdgePort/scheduler/health" `
            -TimeoutSec 5
        $internalProbeContent = $internalProbe.Content
    }
    catch {
        $internalProbeContent = ""
        if ($_.Exception.Response -and $_.Exception.Response.GetResponseStream()) {
            $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
            $internalProbeContent = $reader.ReadToEnd()
            $reader.Dispose()
        }
    }
    if ($internalProbeContent -match '"status"\s*:\s*"ok"') {
        throw "Edge exposed an internal service health response."
    }

    & $ComposeExecutable @compose exec -T api python -c "from api_service.config import Settings; from api_service.database import Database; Database.from_settings(Settings()).check_connection()"
    if ($LASTEXITCODE -ne 0) {
        throw "API database connection check failed."
    }
    & $ComposeExecutable @compose exec -T worker python -c "import os, redis; redis.Redis.from_url(os.environ['PLANNER_WORKER_REDIS_URL']).ping()"
    if ($LASTEXITCODE -ne 0) {
        throw "Worker Redis connection check failed."
    }

    foreach ($service in @("api", "scheduler", "ai", "worker", "postgres", "redis")) {
        $containerId = & $ComposeExecutable @compose ps -q $service
        if ($LASTEXITCODE -ne 0 -or -not $containerId) {
            throw "Could not inspect container for $service."
        }
        $portBindings = docker inspect `
            --format "{{ json .HostConfig.PortBindings }}" `
            $containerId
        if ($LASTEXITCODE -ne 0) {
            throw "Could not inspect port bindings for $service."
        }
        if ($portBindings -ne "null" -and $portBindings -ne "{}") {
            throw "Internal service $service has a published host port."
        }
    }
}
finally {
    if (-not $KeepRunning) {
        & $ComposeExecutable @compose down --volumes --remove-orphans
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "Compose cleanup failed for project $ProjectName."
        }
    }
}
