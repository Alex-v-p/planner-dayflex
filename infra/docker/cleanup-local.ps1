param(
    [string]$ProjectName = "planner-dayflex-smoke",
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
& $ComposeExecutable @ComposeArgs down `
    --volumes --remove-orphans
if ($LASTEXITCODE -ne 0) {
    throw "Compose cleanup failed."
}
