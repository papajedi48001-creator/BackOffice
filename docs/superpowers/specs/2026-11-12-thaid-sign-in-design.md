# เข้าสู่ระบบด้วย ThaID, ตั้งค่าการเข้าสู่ระบบบนเว็บ และปิดการเข้าด้วยรหัสผ่าน

Status: design agreed in the project thread on 2026-11-12 (the hospital already has a ThaID Client ID and Secret from กรมการปกครอง).
Builds on `2026-11-10-provider-id-direct-design.md` and `2026-11-11-provider-id-auto-link-design.md`.
The ThaID protocol follows the radius-server portal (`portal/thaid/client.py`, ADR 0012–0014 in `papajedi48001-creator/radius-server`).

## What the user asked for

1. Staff sign in with ThaID (DOPA digital ID) as well as Provider ID and username/password.
2. ผู้ดูแลระบบ sets up ThaID and Provider ID on a settings page, typing the secrets on the web.
3. One person can use Provider ID or ThaID, whichever is handier, and always lands on the same บุคลากร.
4. Someone who signs in with ThaID first and with Provider ID later gets in at once.
5. "ปิดกล่อง login ด้วยป้องกันบูทฟอส" then "ปิดไปเลย": username-and-password sign-in is closed outright, not left as a web toggle,
   so it cannot be brute-forced.

## Out of scope

- Creating บุคลากร or granting rights from ThaID: ThaID only finds a person already in the HR register.
- Storing anything ThaID returns besides what one sign-in needs. Name, address, photo and other ThaID scopes are not requested.
- Single logout with ThaID or MOPH ID.
- Changing the per-account password lockout (`DatabaseLoginThrottle`), which stays for the break-glass route.

## 1. Sign in with ThaID

Endpoints (DOPA production, overridable by `THAID_API_URL` for the e2e stub only):
`https://imauth.bora.dopa.go.th/api/v2/oauth2/auth/` and `https://imauth.bora.dopa.go.th/api/v2/oauth2/token/`.

1. `GET /api/auth/thaid/start` redirects (303) to the authorize URL with `response_type=code`, `client_id`, `redirect_uri`, `scope=pid`
   and `state` (32 random bytes). The state and the purpose (`sign_in` or `link`) ride only in a sealed ten-minute cookie
   `backoffice_thaid_flow` (path `/api/auth/thaid`), sealed like `backoffice_provider_flow` under the ThaID client secret.
2. DOPA returns to the ThaID redirect URI with `code` and `state`. A missing or foreign state, an `error` answer or a code over 4096
   characters is `?thaid=failed`, audit stage `state`.
3. The server posts `grant_type=authorization_code`, `code`, `redirect_uri` to the token URL with HTTP Basic `client_id:client_secret`,
   10 s timeout, no redirects. The citizen ID is the `pid` of the answer. When an `id_token` is present its `aud` must contain the
   client ID and its `pid`, if any, must equal the answer's `pid` (OIDC Core 3.1.3.7 step 6: the token came straight from DOPA over TLS).
   The `pid` must be 13 digits with a valid mod-11 check digit.
4. Any 4xx, a bad `id_token` or an invalid `pid` is `failed` (audit stage `token`). A network error, timeout, 5xx or non-JSON answer is
   `unavailable` and logs `thaid sign-in failed UNAVAILABLE` without the request.
5. The person is `person.national_id_lookup = NationalIdProtector.lookup(pid)` (the HMAC already kept for every บุคลากร),
   not deleted. ACTIVE → session starts, audit `identity.thaid_login` SUCCESS, then `/change-password` or `/dashboard` as for Provider ID.
   Not ACTIVE → `?thaid=inactive`, audit FAILURE stage `inactive`. No person → `?thaid=not_found`, audit FAILURE stage `not_found`,
   and the sign-in page says "ไม่พบเลขบัตรประชาชนนี้ในทะเบียนบุคลากร กรุณาติดต่อผู้ดูแลระบบ".
6. ThaID needs no link table: the HR national ID is the link. When the national-ID keys are not set, ThaID is shown as not ready and stays off.

The citizen ID lives in memory for one request only. It is never stored, logged, audited, put in a cookie, URL or outbox payload.
Redirects back to the browser are built from the configured ThaID redirect URI, never from `request.url`.

## 2. Same person by either route

- ThaID matches the HR national ID directly (section 1).
- Provider ID keeps its links and its `hash_cid` auto-link (`NationalIdHashMatcher`, SHA-256 hex of the 13 digits). radius-server ADR 0014
  quotes the MOPH manual for this, so a Provider ID sign-in after a ThaID sign-in normally links itself.
- If `hash_cid` does not match (missing, or made another way), the person reaches รอผูกบัญชี (`/link-provider`). That page gains a button
  **ยืนยันด้วย ThaID** → `/api/auth/thaid/start?purpose=link`. Back at the callback with purpose `link`, the server reads the pending
  Provider ID login from `backoffice_provider_ticket`, finds the ACTIVE person by `pid` as in section 1, and calls
  `ExternalLoginService.linkPendingToPerson` which links that Provider ID account to the person (`linkedByPersonId` null,
  audit `identity.provider_link` with `metadata: { method: 'thaid' }`), clears the ticket and starts the session. The person is in
  without waiting for an admin, and later Provider ID sign-ins are linked.
- Link refused because the person already has another Provider ID account, the ticket expired, or no person matched: back to
  `/link-provider` with a message to contact ผู้ดูแลระบบ; nothing is linked. The admin page ผู้ดูแลระบบ > บัญชี Provider ID is unchanged.

## 3. Settings page: ผู้ดูแลระบบ > การเข้าสู่ระบบ

New admin page `/admin/sign-in` (admin tier only, checked on the server through the existing admin permission and `AuthorizationService`).
Two cards, each edited in a `FormDialog`; turning a route off asks in an `ActionDialog`.

| Card | Fields |
|---|---|
| ThaID | เปิด/ปิด, Client ID, Client Secret, Redirect URI (default `https://office-waritch-hosp.moph.go.th/api/auth/thaid/callback`) |
| Provider ID | เปิด/ปิด, environment `prd`/`uat`, MOPH ID Client ID + Secret, Provider ID Client ID + Secret key, Redirect URI |

Each card shows its status (พร้อมใช้งาน / ยังตั้งค่าไม่ครบ / ปิดอยู่), where the values come from (ตั้งค่าจากหน้านี้ / ค่าของเซิร์ฟเวอร์ / ยังไม่ได้ตั้งค่า)
and the redirect URI to register with DOPA or MOPH ID.

Storage: new table `sign_in_setting` (migration `0037_sign_in_setting.sql`), one row per method (`THAID`, `PROVIDER_ID`) with
`enabled`, a JSON of non-secret values, secret columns as AES-256-GCM ciphertext under `CONNECTION_SECRET_KEY` (`ConnectionSecretBox`,
as for the HOSxP password), `updated_by_person_id`, `updated_at`.

- Secrets are write-only: the form shows only ตั้งไว้แล้ว / ยังไม่ได้ตั้ง; a blank secret keeps the stored one. A secret is never sent to the
  browser, logged or audited. Without `CONNECTION_SECRET_KEY` the page says secrets cannot be stored and the secret fields are disabled.
- A saved row wins over the environment. With no saved row, Provider ID keeps reading today's `PROVIDER_ID_*` variables, so the
  current deployment works unchanged until someone saves the card. ThaID has env fallbacks `THAID_CLIENT_ID`, `THAID_CLIENT_SECRET(_FILE)`,
  `THAID_REDIRECT_URI` for symmetry.
- Redirect URIs must be absolute `https` URLs ending with the route's callback path (`/api/auth/thaid/callback`, `/api/auth/provider/callback`).
- Each save writes `admin.sign_in_setting.update` with `metadata: { method, changedFields }` in the same transaction as the row.
- `providerSsoConfig()` and the new `thaidConfig()` become async readers of this service, cached for 30 seconds per process so the sign-in
  page does not hit the database on every request; a save clears the cache in that process.

## 4. Password sign-in is closed

- Username-and-password sign-in is off whenever ThaID or Provider ID is ready (configured and enabled). The sign-in page then shows only the
  ThaID and Provider ID buttons; the form and its "ลืมรหัสผ่าน" line are gone. There is no switch for it on the web.
- `POST /api/auth/local` answers 403 `{ error: 'password_sign_in_off' }` before looking up the account, so no attempt is counted and nothing
  about the account leaks. This is enforced on the server; hiding the form is only presentation.
- Bootstrap: while neither ThaID nor Provider ID is ready (a fresh install, before anyone has set them up), the password form stays, so the
  first ผู้ดูแลระบบ can sign in and configure them. `/setup` is unchanged.
- Turning off the last ready route on the settings page is refused with `LAST_SIGN_IN_ROUTE`, so the web cannot lock everyone out by accident.
- Break-glass: `PASSWORD_SIGN_IN=on` in the web environment shows the form again, for when DOPA and MOPH ID are both down. The deploy runbook
  says how to set and remove it. It is never on in the committed compose files.
- Signed-in people can still change their password at `/change-password`; the local accounts stay for the break-glass route.

## Deployment

- No new compose file: ThaID needs only outbound HTTPS from web, which the existing `egress` network of
  `infra/compose/docker-compose.provider-sso.yml` gives. `imauth.bora.dopa.go.th` must be reachable from .251.
- `CONNECTION_SECRET_KEY` must be set for web. If .251 does not have it yet, `infra/staging-251/setup-sign-in-settings.sh` (run once with sudo by
  the machine owner) creates `/etc/backoffice/secrets/connection-secret-key` (root, 0600) and adds it to the provider-sso override.
- The ThaID redirect URI `https://office-waritch-hosp.moph.go.th/api/auth/thaid/callback` must be registered with DOPA for the hospital's client.

## Testing

- Unit: ThaID client (token answer, `id_token` audience and `pid` agreement, check digit, error mapping), flow cookie, settings service
  (validation, secret sealing, blank-keeps, env fallback, audit metadata without secrets, last-route guard), password-sign-in rule
  (off when a route is ready, on during bootstrap and with `PASSWORD_SIGN_IN=on`), `linkPendingToPerson`.
- Route tests: `/api/auth/thaid/start`, `/api/auth/thaid/callback` (sign-in and link purposes, every outcome), `/api/auth/local` when off,
  settings API authorization (non-admin 403).
- Integration (MariaDB): migration 0037, settings row round trip, link + audit in one transaction.
- e2e with a ThaID stub: sign in with ThaID; Provider ID pending → ยืนยันด้วย ThaID → dashboard; password form absent once a route is ready.
