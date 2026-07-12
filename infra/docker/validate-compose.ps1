param(
    [string]$ProjectName = "planner-dayflex-check",
    [string]$EnvFile = "$PSScriptRoot/.env.example"
)

$ErrorActionPreference = "Stop"
$ComposeFile = Join-Path $PSScriptRoot "../compose.yml"
$ComposeExecutable = "docker"
$ComposePrefix = @("compose")
if (Get-Command docker-compose -ErrorAction SilentlyContinue) {
    $ComposeExecutable = "docker-compose"
    $ComposePrefix = @()
}

$ComposeArgs = $ComposePrefix + @("--env-file", $EnvFile, "-f", $ComposeFile, "-p", $ProjectName)
& $ComposeExecutable @ComposeArgs config
if ($LASTEXITCODE -ne 0) {
    throw "Compose config validation failed."
}
