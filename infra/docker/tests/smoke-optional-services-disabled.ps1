param(
    [string]$ProjectName = "planner-dayflex-optional-disabled",
    [string]$EnvFile = "$PSScriptRoot/../.env.example",
    [int]$EdgePort = 18080
)

$ErrorActionPreference = "Stop"
$ComposeFile = Join-Path $PSScriptRoot "../../compose.yml"
$ComposeExecutable = "docker"
$ComposePrefix = @("compose")
if (Get-Command docker-compose -ErrorAction SilentlyContinue) {
    $ComposeExecutable = "docker-compose"
    $ComposePrefix = @()
}

$previousEdgePort = $env:PLANNER_EDGE_PORT
$env:PLANNER_EDGE_PORT = "$EdgePort"
$compose = $ComposePrefix + @("--env-file", $EnvFile, "-f", $ComposeFile, "-p", $ProjectName)

try {
    & $ComposeExecutable @compose up --build --wait -d edge web api scheduler postgres redis
    if ($LASTEXITCODE -ne 0) {
        throw "Reduced Compose startup failed."
    }

    foreach ($disabledService in @("ai", "worker")) {
        $containerId = & $ComposeExecutable @compose ps -q $disabledService
        if ($LASTEXITCODE -ne 0) {
            throw "Could not inspect disabled service $disabledService."
        }
        if ($containerId) {
            throw "Optional service $disabledService started in reduced topology."
        }
    }

    $apiHealth = Invoke-RestMethod -Uri "http://127.0.0.1:$EdgePort/api/health" -TimeoutSec 5
    if ($apiHealth.status -ne "ok") {
        throw "API health through edge returned unexpected status without optional services."
    }

    & $ComposeExecutable @compose exec -T scheduler python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8001/health', timeout=2).read()"
    if ($LASTEXITCODE -ne 0) {
        throw "Scheduler health check failed without optional services."
    }
}
finally {
    if ($null -eq $previousEdgePort) {
        Remove-Item Env:\PLANNER_EDGE_PORT -ErrorAction SilentlyContinue
    }
    else {
        $env:PLANNER_EDGE_PORT = $previousEdgePort
    }

    & $ComposeExecutable @compose down --volumes --remove-orphans
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Compose cleanup failed for project $ProjectName."
    }
}
