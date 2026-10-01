# Internal Staging CA (pilot only)

This procedure creates a private CA for the staging hostname
`backoffice-stg.waritch-hosp.moph.go.th`. It is not a replacement for the
hospital's future enterprise PKI or a public certificate authority.

## Security boundary

- Run this only on a controlled Windows administrator workstation.
- Use an output directory outside this repository and outside cloud-synced
  folders, for example `D:\Waritch-CA`.
- The script prompts for the root-CA passphrase. Do not send or record that
  passphrase in chat, tickets, source control, or shell history.
- `root-ca.key.pem` must remain on that workstation. Never copy it to the
  Linux server, Docker, MinIO, or a user device.
- Limit trust installation to the designated pilot clients. Remove that trust
  when the pilot ends or when a hospital PKI supersedes it.

## Create the CA and staging certificate

Install OpenSSL first if neither Git for Windows nor OpenSSL is present. Then,
from the checked-out Back Office repository, run this in a native PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\infra\tls\create-staging-ca.ps1 -OutputDirectory D:\Waritch-CA
```

Enter a strong root-CA passphrase when OpenSSL prompts. The script refuses to
overwrite an existing root key and verifies the signed leaf certificate before
reporting success.

It produces these relevant files:

| File | Use |
| --- | --- |
| `root-ca.cer` | Import into **Trusted Root Certification Authorities** on designated pilot clients. This is public. |
| `root-ca.key.pem` | Root private key. Keep only on the controlled administrator workstation. |
| `backoffice-stg.crt.pem` | Leaf certificate for Nginx on `192.168.1.251`. |
| `backoffice-stg.key.pem` | Leaf private key for Nginx on `192.168.1.251`. |

## Next operational boundary

After a pilot client trusts `root-ca.cer`, copy only the two leaf files to the
staging server using the approved administrator transfer path. Install them as:

```text
/etc/pki/tls/certs/backoffice-stg.waritch-hosp.moph.go.th.crt
/etc/pki/tls/private/backoffice-stg.waritch-hosp.moph.go.th.key
```

The next runbook step validates the leaf fingerprint, installs the Nginx
virtual host, tests `nginx -t`, and reloads Nginx. Do not expose port 443 to
the WAN for this pilot.
