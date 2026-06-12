# Stop and remove the FinAlly container (Windows PowerShell). The DB volume is
# kept so data persists; remove it with `docker volume rm finally-db` to reset.
$ErrorActionPreference = "Stop"

$Name = "finally"

if (docker ps -a --format '{{.Names}}' | Select-String -Pattern "^$Name$") {
  Write-Host "==> Stopping and removing container '$Name'..."
  docker rm -f $Name | Out-Null
  Write-Host "Stopped. (Data volume 'finally-db' preserved.)"
} else {
  Write-Host "No '$Name' container is running."
}
