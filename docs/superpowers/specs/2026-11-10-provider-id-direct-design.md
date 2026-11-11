# เข้าสู่ระบบด้วย Provider ID โดยตรง (MOPH ID + Provider ID)

Status: approved in the project thread on 2026-11-10 (the user chose "ต่างคนต่าง login" and PRD only; they have no UAT account).
Replaces the portal route of `2026-11-09-provider-id-sso-design.md`. Account links, the link page, the admin page and the audit events stay as they are.

## Why

BackOffice is public at `https://office-waritch-hosp.moph.go.th` and staff must sign in with Provider ID from outside the hospital.
The radius-server portal answers only inside the hospital (radius-server ADR 0006), so BackOffice signs in against the ministry itself,
the same way the portal does (`portal/auth/routes.py`, `portal/provider/client.py` in radius-server).

## Flow

1. `GET /api/auth/provider/start` redirects (303) to `<health>/oauth/redirect?client_id&redirect_uri&response_type=code&state`.
   `state` is 32 random bytes and rides only in the existing sealed ten-minute cookie `backoffice_provider_flow` (path `/api/auth/provider`).
2. MOPH ID returns to `PROVIDER_ID_REDIRECT_URI` with `code` and `state`. A missing or foreign state, an `error` answer or a code over 512 characters is
   `?provider=failed` with audit stage `state`, as today.
3. The server exchanges the code: `POST <health>/api/v1/token` (form: grant_type, code, redirect_uri, client_id, client_secret) → `access_token`.
4. `POST <provider>/api/v1/services/token` (JSON: client_id, secret_key, token_by `Health ID`, token) → `access_token`;
   `GET <provider>/api/v1/services/profile` (Bearer token, `client-id`, `secret-key` headers) → `account_id`, `firstname_th`, `lastname_th`.
   Both services may wrap the answer as `{ data: {...} }`.
5. The identity is `{ issuer: <provider base URL>, subject: account_id, displayName: "firstname lastname" | null }` and goes to the
   existing `ExternalLoginService.resolve`. Nothing else from the profile is kept: never `hash_cid`, organizations or positions.

Any 4xx answer from steps 3–4, or a profile without `account_id`, is `failed` (audit stage `token`).
A network error, timeout (10 s), 5xx or non-JSON answer is `unavailable` and logs `provider sign-in failed UNAVAILABLE` without the request.
Requests never follow redirects.

## Configuration

| Variable | Meaning |
|---|---|
| `PROVIDER_ID_ENV` | `prd` (default) → `https://moph.id.th` + `https://provider.id.th`; `uat` → `https://uat-moph.id.th` + `https://uat-provider.id.th` |
| `PROVIDER_ID_HEALTH_CLIENT_ID`, `PROVIDER_ID_HEALTH_CLIENT_SECRET(_FILE)` | MOPH ID client; the redirect URI must be registered on it |
| `PROVIDER_ID_CLIENT_ID`, `PROVIDER_ID_SECRET_KEY(_FILE)` | Provider ID service client |
| `PROVIDER_ID_REDIRECT_URI` | `https://office-waritch-hosp.moph.go.th/api/auth/provider/callback` |
| `PROVIDER_ID_HEALTH_URL`, `PROVIDER_ID_API_URL` | optional base-URL overrides, for the e2e stub only |

The button shows only when the two client IDs, both secrets and the redirect URI are set and the environment is `prd` or `uat`.
The radius-server PRD credentials (`/etc/hospital-provider-id/{health,provider}-prd.*`) may be reused once the MOPH ID client also lists the
BackOffice redirect URI. The portal's own redirect URI must stay registered.

## Docker

`infra/compose/docker-compose.provider-sso.yml` passes the variables, mounts the two secrets from
`PROVIDER_ID_HEALTH_CLIENT_SECRET_FILE` and `PROVIDER_ID_SECRET_KEY_FILE`, and puts only web on a non-internal `egress` network
pinned to `BACKOFFICE_EGRESS_SUBNET` (never 172.18.0.0/16). The portal host pin is removed.

## Removed or kept

Sign-in no longer uses `PortalOidcClient` or the `PROVIDER_SSO_*` variables. Both stay only for the portal's photo requests
(`/api/portal/photo`, `2026-11-10-portal-profile-photo-design.md`), read through `portalSsoConfig()`. That route finds links by portal member id,
so it finds only links made through the portal; links made here are keyed by Provider ID `account_id`. Aligning the two is follow-up work.
Links made through the portal keep their old issuer and are not matched by sign-in; none are in use.
