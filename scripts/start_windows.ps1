# Build and launch FinAlly in a single Docker container (Windows PowerShell).
# Usage: ./scripts/start_windows.ps1
$ErrorActionPreference = "Stop"

Set-Location (Join-Path $PSScriptRoot "..")

$Image = "finally:latest"
$Name = "finally"
$Port = 8000

Write-Host "==> Building $Image (first run may take a few minutes)..."
docker build -t $Image .

# Replace any previous container so the script is re-runnable.
if (docker ps -a --format '{{.Names}}' | Select-String -Pattern "^$Name$") {
  Write-Host "==> Removing existing container..."
  docker rm -f $Name | Out-Null
}

$EnvArgs = @()
if (Test-Path ".env") {
  Write-Host "==> Loading environment from .env"
  $EnvArgs = @("--env-file", ".env")
}

Write-Host "==> Starting container on http://localhost:$Port ..."
docker run -d --name $Name -p "$($Port):8000" -v finally-db:/app/db @EnvArgs $Image | Out-Null

Write-Host -NoNewline "==> Waiting for the API to come up"
for ($i = 0; $i -lt 30; $i++) {
  try {
    Invoke-WebRequest -UseBasicParsing "http://localhost:$Port/api/health" -TimeoutSec 2 | Out-Null
    Write-Host " - ready."
    Start-Process "http://localhost:$Port"
    Write-Host "FinAlly is running at http://localhost:$Port"
    Write-Host "Stop it with ./scripts/stop_windows.ps1"
    exit 0
  } catch {
    Write-Host -NoNewline "."
    Start-Sleep -Seconds 1
  }
}

Write-Host ""
Write-Error "API did not become healthy in time. Recent logs:"
docker logs --tail 40 $Name
exit 1
