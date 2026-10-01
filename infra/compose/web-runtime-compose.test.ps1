$ErrorActionPreference = 'Stop'

$productionPath = Join-Path $PSScriptRoot 'docker-compose.production.yml'
if (-not (Test-Path -LiteralPath $productionPath)) {
  throw "Missing production Compose file: $productionPath"
}

$production = Get-Content -LiteralPath $productionPath -Raw
if (-not $production.Contains('HOSTNAME: 0.0.0.0')) {
  throw 'Web runtime must bind Next.js to 0.0.0.0 so its loopback healthcheck can connect.'
}

Write-Host 'Web runtime Compose checks passed.'
