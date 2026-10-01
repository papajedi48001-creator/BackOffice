$ErrorActionPreference = 'Stop'

$scriptPath = Join-Path $PSScriptRoot 'create-staging-ca.ps1'
if (-not (Test-Path -LiteralPath $scriptPath)) {
  throw "Missing CA creation script: $scriptPath"
}

$content = Get-Content -LiteralPath $scriptPath -Raw
$requiredSnippets = @(
  '[Parameter(Mandatory = $true)]',
  'OutputDirectory',
  'backoffice-stg.waritch-hosp.moph.go.th',
  'root-ca.key.pem',
  'Output directory must be outside the repository',
  '$candidates = @(',
  'return $candidates[0]',
  'genrsa',
  'req',
  'x509',
  'verify',
  'AES-256 encrypted root private key'
)

foreach ($snippet in $requiredSnippets) {
  if (-not $content.Contains($snippet)) {
    throw "CA script is missing required safety or certificate operation: $snippet"
  }
}

Write-Host 'Internal staging CA script static checks passed.'
