$ErrorActionPreference = 'Stop'

$composePath = Join-Path $PSScriptRoot 'docker-compose.staging.yml'
$sharedNginxPath = Join-Path $PSScriptRoot 'docker-compose.staging-shared-nginx.yml'
$productionPath = Join-Path $PSScriptRoot 'docker-compose.production.yml'
$environmentPath = Join-Path $PSScriptRoot '.env.staging.example'
$helperPath = Join-Path $PSScriptRoot '..\scripts\staging-network.sh'
$attributesPath = Join-Path $PSScriptRoot '..\..\.gitattributes'

foreach ($path in @($composePath, $sharedNginxPath, $productionPath, $environmentPath, $helperPath, $attributesPath)) {
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Missing staging network artifact: $path"
  }
}

$compose = Get-Content -LiteralPath $composePath -Raw
$sharedNginx = Get-Content -LiteralPath $sharedNginxPath -Raw
$production = Get-Content -LiteralPath $productionPath -Raw
$environment = Get-Content -LiteralPath $environmentPath -Raw
$helper = Get-Content -LiteralPath $helperPath -Raw
$attributes = Get-Content -LiteralPath $attributesPath -Raw

$expectations = @(
  @{ Content = $compose; Snippet = 'subnet: ${BACKOFFICE_BACKPLANE_SUBNET:?set BACKOFFICE_BACKPLANE_SUBNET}' },
  @{ Content = $sharedNginx; Snippet = 'backplane:' },
  @{ Content = $sharedNginx; Snippet = 'internal: false' },
  @{ Content = $production; Snippet = 'internal: true' },
  @{ Content = $environment; Snippet = 'BACKOFFICE_BACKPLANE_SUBNET=10.250.251.0/24' },
  @{ Content = $helper; Snippet = 'reset-network' },
  @{ Content = $helper; Snippet = 'docker compose' },
  @{ Content = $helper; Snippet = '172.18.0.0/16' },
  @{ Content = $helper; Snippet = 'up -d mariadb redis minio' }
  @{ Content = $attributes; Snippet = '*.sh text eol=lf' }
)

foreach ($expectation in $expectations) {
  if (-not $expectation.Content.Contains($expectation.Snippet)) {
    throw "Missing required staging network guard: $($expectation.Snippet)"
  }
}

$temporaryDirectory = Join-Path ([IO.Path]::GetTempPath()) ("backoffice-archive-test-{0}" -f [Guid]::NewGuid())
New-Item -ItemType Directory -Path $temporaryDirectory | Out-Null
try {
  $archivePath = Join-Path $temporaryDirectory 'staging-network.tar'
  git -C (Join-Path $PSScriptRoot '..\..') archive --worktree-attributes --format=tar --output $archivePath HEAD infra/scripts/staging-network.sh
  if ($LASTEXITCODE -ne 0) { throw 'Unable to create the Git archive for line-ending verification.' }
  tar.exe -xf $archivePath -C $temporaryDirectory
  if ($LASTEXITCODE -ne 0) { throw 'Unable to extract the Git archive for line-ending verification.' }
  $archiveBytes = [IO.File]::ReadAllBytes((Join-Path $temporaryDirectory 'infra\scripts\staging-network.sh'))
  if ($archiveBytes -contains 13) {
    throw 'Git archive contains CRLF in staging-network.sh; Linux Bash requires LF.'
  }
} finally {
  Remove-Item -LiteralPath $temporaryDirectory -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host 'Staging network compose checks passed.'
