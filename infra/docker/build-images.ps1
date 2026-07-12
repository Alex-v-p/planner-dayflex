param(
    [string]$ProjectName = "planner-dayflex-build",
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
& $ComposeExecutable @ComposeArgs build `
    web api scheduler ai worker
if ($LASTEXITCODE -ne 0) {
    throw "Compose image build failed."
}
