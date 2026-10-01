[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$OutputDirectory,

  [string]$Hostname = 'backoffice-stg.waritch-hosp.moph.go.th',

  [string]$Organization = 'Waritch Hospital'
)

$ErrorActionPreference = 'Stop'

function Find-OpenSsl {
  $fromPath = Get-Command openssl -ErrorAction SilentlyContinue
  $candidates = @(
    $fromPath.Source
    'C:\Program Files\Git\usr\bin\openssl.exe'
    'C:\Program Files\OpenSSL-Win64\bin\openssl.exe'
  ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

  if ($candidates.Count -eq 0) {
    throw 'OpenSSL was not found. Install OpenSSL or Git for Windows, then run this script again.'
  }

  return $candidates[0]
}

function Invoke-OpenSsl {
  param([string[]]$Arguments)

  & $script:openSsl @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "OpenSSL failed: $($Arguments -join ' ')"
  }
}

$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..')).TrimEnd('\')
$outputFullPath = [IO.Path]::GetFullPath($OutputDirectory).TrimEnd('\')
if ($outputFullPath.StartsWith($repositoryRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Output directory must be outside the repository. The CA private key must never be stored in Git.'
}

$openSsl = Find-OpenSsl
$rootKey = Join-Path $outputFullPath 'root-ca.key.pem'
$rootCertificate = Join-Path $outputFullPath 'root-ca.crt.pem'
$rootCertificateDer = Join-Path $outputFullPath 'root-ca.cer'
$leafKey = Join-Path $outputFullPath 'backoffice-stg.key.pem'
$leafRequest = Join-Path $outputFullPath 'backoffice-stg.csr.pem'
$leafCertificate = Join-Path $outputFullPath 'backoffice-stg.crt.pem'
$extensionFile = Join-Path $outputFullPath 'backoffice-stg.extensions.cnf'

if (Test-Path -LiteralPath $rootKey) {
  throw "Refusing to overwrite an existing root CA private key: $rootKey"
}

New-Item -ItemType Directory -Force -Path $outputFullPath | Out-Null

# The following command interactively asks the administrator for a passphrase.
# It creates an AES-256 encrypted root private key; never copy this file to .251.
Invoke-OpenSsl @('genrsa', '-aes256', '-out', $rootKey, '4096')
Invoke-OpenSsl @(
  'req', '-x509', '-new', '-sha256', '-days', '1825',
  '-key', $rootKey,
  '-out', $rootCertificate,
  '-subj', "/C=TH/O=$Organization/OU=IT/CN=Waritch Hospital Staging Root CA"
)

Invoke-OpenSsl @('x509', '-in', $rootCertificate, '-outform', 'DER', '-out', $rootCertificateDer)
Invoke-OpenSsl @('genrsa', '-out', $leafKey, '4096')
Invoke-OpenSsl @(
  'req', '-new', '-sha256',
  '-key', $leafKey,
  '-out', $leafRequest,
  '-subj', "/C=TH/O=$Organization/OU=IT/CN=$Hostname"
)

@"
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=DNS:$Hostname
authorityKeyIdentifier=keyid,issuer
subjectKeyIdentifier=hash
"@ | Set-Content -LiteralPath $extensionFile -NoNewline -Encoding ascii

Invoke-OpenSsl @(
  'x509', '-req', '-sha256', '-days', '90',
  '-in', $leafRequest,
  '-CA', $rootCertificate,
  '-CAkey', $rootKey,
  '-CAcreateserial',
  '-out', $leafCertificate,
  '-extfile', $extensionFile
)
Invoke-OpenSsl @('verify', '-CAfile', $rootCertificate, $leafCertificate)

Write-Host ''
Write-Host 'Internal staging CA created successfully.'
Write-Host "Root certificate for pilot trust: $rootCertificateDer"
Write-Host "Leaf certificate for .251:        $leafCertificate"
Write-Host "Leaf private key for .251:        $leafKey"
Write-Host 'Keep root-ca.key.pem only on this controlled administrator workstation.'
