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
$baseUri = "http://127.0.0.1:$EdgePort"

function Invoke-ApiJson {
    param(
        [ValidateSet("GET", "POST", "PUT")]
        [string]$Method,
        [string]$Path,
        [object]$Body = $null,
        [Microsoft.PowerShell.Commands.WebRequestSession]$Session = $null,
        [hashtable]$Headers = @{}
    )

    $parameters = @{
        Method = $Method
        Uri = "$baseUri/api$Path"
        TimeoutSec = 10
        Headers = $Headers
    }
    if ($Session) {
        $parameters.WebSession = $Session
    }
    if ($null -ne $Body) {
        $parameters.ContentType = "application/json"
        $parameters.Body = ($Body | ConvertTo-Json -Depth 12)
    }
    Invoke-RestMethod @parameters
}

function Assert-Equal {
    param(
        [object]$Actual,
        [object]$Expected,
        [string]$Message
    )
    if ($Actual -ne $Expected) {
        throw "$Message Expected '$Expected', got '$Actual'."
    }
}

function Assert-Contains {
    param(
        [object[]]$Values,
        [object]$Expected,
        [string]$Message
    )
    if ($Values -notcontains $Expected) {
        throw "$Message Missing '$Expected'."
    }
}

try {
    & $ComposeExecutable @compose up --build --wait -d edge web api scheduler ai worker postgres redis
    if ($LASTEXITCODE -ne 0) {
        throw "Compose startup failed."
    }

    $edgeHealth = Invoke-RestMethod -Uri "$baseUri/edge-health" -TimeoutSec 5
    if ($edgeHealth.status -ne "ok") {
        throw "Edge health returned unexpected status."
    }

    $apiHealthResponse = Invoke-WebRequest `
        -Uri "$baseUri/api/health" `
        -Headers @{"X-Request-ID" = "smoke-health-req"} `
        -UseBasicParsing `
        -TimeoutSec 5
    $apiHealth = $apiHealthResponse.Content | ConvertFrom-Json
    if ($apiHealth.status -ne "ok") {
        throw "API health through edge returned unexpected status."
    }
    Assert-Equal `
        $apiHealthResponse.Headers["X-Request-ID"] `
        "smoke-health-req" `
        "API health did not preserve a safe request ID."

    $apiReady = Invoke-RestMethod -Uri "$baseUri/api/ready" -TimeoutSec 10
    if ($apiReady.status -ne "ok") {
        throw "API readiness through edge returned unexpected status."
    }
    foreach ($check in @("database", "scheduler")) {
        $readyCheck = $apiReady.checks | Where-Object { $_.name -eq $check }
        if (-not $readyCheck -or $readyCheck.status -ne "ok") {
            throw "API readiness check failed for $check."
        }
    }

    try {
        $internalProbe = Invoke-WebRequest `
            -Uri "http://127.0.0.1:$EdgePort/scheduler/health" `
            -UseBasicParsing `
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

    $unique = [guid]::NewGuid().ToString("N").Substring(0, 12)
    $username = "smoke_$unique"
    $password = "correct horse battery $unique"
    $requestId = "smoke-flow-$unique"

    Invoke-RestMethod `
        -Method Post `
        -Uri "$baseUri/api/auth/register" `
        -ContentType "application/json" `
        -Headers @{"X-Request-ID" = $requestId} `
        -Body (@{ username = $username; password = $password } | ConvertTo-Json) `
        -SessionVariable ApiSession `
        -TimeoutSec 10 | Out-Null

    Invoke-ApiJson `
        -Method PUT `
        -Path "/planning/preferences" `
        -Session $ApiSession `
        -Headers @{"X-Request-ID" = $requestId} `
        -Body @{
            time_zone = "Europe/Brussels"
            day_start_local = "08:00:00"
            day_end_local = "18:00:00"
            default_buffer_minutes = 10
        } | Out-Null

    $day = Invoke-ApiJson `
        -Method POST `
        -Path "/planning/days" `
        -Session $ApiSession `
        -Headers @{"X-Request-ID" = $requestId} `
        -Body @{ local_date = "2026-06-22"; time_zone = "Europe/Brussels" }

    $fixedEvents = @{}
    foreach ($event in @(
        @{ title = "Team meeting"; start_at = "2026-06-22T09:00:00+02:00"; end_at = "2026-06-22T10:00:00+02:00" },
        @{ title = "Lunch appointment"; start_at = "2026-06-22T12:00:00+02:00"; end_at = "2026-06-22T13:00:00+02:00" },
        @{ title = "Collection appointment"; start_at = "2026-06-22T15:30:00+02:00"; end_at = "2026-06-22T16:00:00+02:00" }
    )) {
        $created = Invoke-ApiJson `
            -Method POST `
            -Path "/planning/days/$($day.id)/fixed-events" `
            -Session $ApiSession `
            -Headers @{"X-Request-ID" = $requestId} `
            -Body @{
                title = $event.title
                start_at = $event.start_at
                end_at = $event.end_at
                time_zone = "Europe/Brussels"
            }
        $fixedEvents[$event.title] = $created.id
    }

    $tasks = @{}
    foreach ($task in @(
        @{ title = "Reply to inbox"; estimated_minutes = 45; priority = 4; splitting_allowed = $false; min_segment_minutes = $null },
        @{ title = "Write report"; estimated_minutes = 90; priority = 5; splitting_allowed = $false; min_segment_minutes = $null },
        @{ title = "Study notes"; estimated_minutes = 90; priority = 3; splitting_allowed = $true; min_segment_minutes = 15 },
        @{ title = "Buy groceries"; estimated_minutes = 30; priority = 2; due_date = "2026-06-22"; splitting_allowed = $false; min_segment_minutes = $null }
    )) {
        $created = Invoke-ApiJson `
            -Method POST `
            -Path "/planning/tasks" `
            -Session $ApiSession `
            -Headers @{"X-Request-ID" = $requestId} `
            -Body $task
        $tasks[$task.title] = $created.id
    }

    $firstPlan = Invoke-ApiJson `
        -Method POST `
        -Path "/planning/days/$($day.id)/generate-plan" `
        -Session $ApiSession `
        -Headers @{"X-Request-ID" = $requestId}
    Assert-Equal $firstPlan.version 1 "Initial schedule version mismatch."
    Assert-Contains $firstPlan.decisions.reason_code "designated_free_time" `
        "Initial schedule did not expose free time."

    foreach ($progress in @(
        @{ task_id = $tasks["Reply to inbox"]; completed_minutes = 45; recorded_at = "2026-06-22T08:45:00+02:00" },
        @{ task_id = $tasks["Write report"]; completed_minutes = 90; recorded_at = "2026-06-22T11:30:00+02:00" },
        @{ task_id = $tasks["Study notes"]; completed_minutes = 60; recorded_at = "2026-06-22T14:00:00+02:00" }
    )) {
        Invoke-ApiJson `
            -Method POST `
            -Path "/planning/days/$($day.id)/task-progress" `
            -Session $ApiSession `
            -Headers @{"X-Request-ID" = $requestId} `
            -Body $progress | Out-Null
    }

    $revised = Invoke-ApiJson `
        -Method POST `
        -Path "/planning/days/$($day.id)/interruptions" `
        -Session $ApiSession `
        -Headers @{"X-Request-ID" = $requestId} `
        -Body @{
            start_at = "2026-06-22T14:00:00+02:00"
            end_at = "2026-06-22T15:15:00+02:00"
            time_zone = "Europe/Brussels"
            reported_at = "2026-06-22T14:00:00+02:00"
        }

    Assert-Equal $revised.version 2 "Revised schedule version mismatch."
    Assert-Contains $revised.decisions.reason_code "moved_after_interruption" `
        "Revised schedule did not include a moved-after-interruption decision."
    Assert-Contains $revised.decisions.reason_code "designated_free_time" `
        "Revised schedule did not include a designated free-time decision."

    $interruptionItem = $revised.items | Where-Object {
        $_.kind -eq "interruption" -and
        $_.start_at -eq "2026-06-22T14:00:00+02:00" -and
        $_.end_at -eq "2026-06-22T15:15:00+02:00" -and
        $_.interruption_id
    }
    if (-not $interruptionItem) {
        throw "Revised schedule did not include the interruption window."
    }
    $remainingStudy = $revised.items | Where-Object {
        $_.kind -eq "task" -and
        $_.task_id -eq $tasks["Study notes"] -and
        $_.start_at -eq "2026-06-22T16:00:00+02:00" -and
        $_.end_at -eq "2026-06-22T16:30:00+02:00"
    }
    if (-not $remainingStudy) {
        throw "Revised schedule did not place remaining study work."
    }
    $groceries = $revised.items | Where-Object {
        $_.kind -eq "task" -and
        $_.task_id -eq $tasks["Buy groceries"] -and
        $_.start_at -eq "2026-06-22T16:40:00+02:00" -and
        $_.end_at -eq "2026-06-22T17:10:00+02:00"
    }
    if (-not $groceries) {
        throw "Revised schedule did not keep groceries before day end."
    }
    $finalFreeTime = $revised.items | Where-Object {
        $_.kind -eq "designated_free_time" -and
        $_.start_at -eq "2026-06-22T17:20:00+02:00" -and
        $_.end_at -eq "2026-06-22T18:00:00+02:00"
    }
    if (-not $finalFreeTime) {
        throw "Revised schedule did not expose the final free-time window."
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
