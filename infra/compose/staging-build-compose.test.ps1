$ErrorActionPreference = 'Stop'

$overridePath = Join-Path $PSScriptRoot 'docker-compose.staging-build.yml'
if (-not (Test-Path -LiteralPath $overridePath)) {
  throw "Missing staging source-build compose override: $overridePath"
}

$content = Get-Content -LiteralPath $overridePath -Raw
$requiredSnippets = @(
  'web:',
  'worker:',
  'context: ../..',
  'dockerfile: apps/web/Dockerfile',
  'dockerfile: apps/worker/Dockerfile',
  'image: ${WEB_IMAGE:?set WEB_IMAGE}',
  'image: ${WORKER_IMAGE:?set WORKER_IMAGE}'
)

foreach ($snippet in $requiredSnippets) {
  if (-not $content.Contains($snippet)) {
    throw "Staging source-build override is missing: $snippet"
  }
}

Write-Host 'Staging source-build compose checks passed.'
