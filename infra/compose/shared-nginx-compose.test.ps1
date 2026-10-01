$ErrorActionPreference = 'Stop'

$overrideFile = Join-Path $PSScriptRoot 'docker-compose.staging-shared-nginx.yml'
$nginxTemplate = Join-Path $PSScriptRoot '..\nginx\backoffice-staging.conf.template'
$stagingEnv = Join-Path $PSScriptRoot '.env.staging.example'
$productionEnv = Join-Path $PSScriptRoot '.env.production.example'

if (-not (Test-Path -LiteralPath $overrideFile)) {
  throw "Missing shared Nginx staging override: $overrideFile"
}

$content = Get-Content -Raw -LiteralPath $overrideFile
if ($content -notmatch [regex]::Escape('127.0.0.1:${STAGING_WEB_PORT:-3100}:3000')) {
  throw 'The shared Nginx override must publish the web service only on loopback port 3100.'
}

if ($content -notmatch [regex]::Escape('profiles: ["standalone-edge"]')) {
  throw 'The shared Nginx override must disable the standalone Caddy edge by default.'
}

if (-not (Test-Path -LiteralPath $nginxTemplate)) {
  throw "Missing shared Nginx virtual-host template: $nginxTemplate"
}

$nginx = Get-Content -Raw -LiteralPath $nginxTemplate
foreach ($required in @('server_name __BACKOFFICE_STAGING_HOSTNAME__;', 'proxy_pass http://127.0.0.1:3100;', 'listen 443 ssl http2;')) {
  if ($nginx -notmatch [regex]::Escape($required)) {
    throw "Nginx template is missing required directive: $required"
  }
}

if (-not (Test-Path -LiteralPath $stagingEnv)) {
  throw "Missing staging environment example: $stagingEnv"
}

$staging = Get-Content -Raw -LiteralPath $stagingEnv
if ($staging -notmatch [regex]::Escape('COMPOSE_PROJECT_NAME=waritch-backoffice-staging')) {
  throw 'The staging environment must use its own Compose project name.'
}

foreach ($environmentFile in @($stagingEnv, $productionEnv)) {
  $environment = Get-Content -Raw -LiteralPath $environmentFile
  if ($environment -match 'MINIO_IMAGE=.*:latest') {
    throw "MinIO image must use an approved immutable reference: $environmentFile"
  }
  if ($environment -notmatch [regex]::Escape('MINIO_IMAGE=registry.example.internal/waritch-backoffice/minio:replace-with-approved-digest')) {
    throw "MinIO image must be an approved private-registry placeholder: $environmentFile"
  }
}

Write-Output 'shared Nginx staging override keeps the web service on loopback'
