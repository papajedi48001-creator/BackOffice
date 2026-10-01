$ErrorActionPreference = 'Stop'

$composePath = Join-Path $PSScriptRoot 'docker-compose.staging.yml'
$environmentPath = Join-Path $PSScriptRoot '.env.staging.example'
$helperPath = Join-Path $PSScriptRoot '..\scripts\staging-network.sh'

foreach ($path in @($composePath, $environmentPath, $helperPath)) {
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Missing staging network artifact: $path"
  }
}

$compose = Get-Content -LiteralPath $composePath -Raw
$environment = Get-Content -LiteralPath $environmentPath -Raw
$helper = Get-Content -LiteralPath $helperPath -Raw

$expectations = @(
  @{ Content = $compose; Snippet = 'subnet: ${BACKOFFICE_BACKPLANE_SUBNET:?set BACKOFFICE_BACKPLANE_SUBNET}' },
  @{ Content = $environment; Snippet = 'BACKOFFICE_BACKPLANE_SUBNET=10.250.251.0/24' },
  @{ Content = $helper; Snippet = 'reset-network' },
  @{ Content = $helper; Snippet = 'docker compose' },
  @{ Content = $helper; Snippet = '172.18.0.0/16' },
  @{ Content = $helper; Snippet = 'up -d mariadb redis minio' }
)

foreach ($expectation in $expectations) {
  if (-not $expectation.Content.Contains($expectation.Snippet)) {
    throw "Missing required staging network guard: $($expectation.Snippet)"
  }
}

Write-Host 'Staging network compose checks passed.'
