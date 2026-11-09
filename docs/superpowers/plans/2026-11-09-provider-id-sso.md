# Provider ID SSO ผ่าน portal Radius — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** บุคลากรเข้า BackOffice ด้วยปุ่ม "เข้าสู่ระบบด้วย Provider ID" โดย portal ของ radius-server เป็น OpenID Provider

**Architecture:** portal (FastAPI, radius-server) เพิ่ม OIDC authorization code + PKCE ที่ออก ID token ES256 ให้ client เดียวคือ BackOffice; BackOffice (Next.js) เป็น confidential client ตรวจ token ด้วย `node:crypto` (ไม่เพิ่ม dependency), จับคู่ `sub` กับบุคลากรผ่านตาราง `person_external_identity` และให้ผูกเองด้วยรหัสผ่านหรือ admin ผูกให้

**Tech Stack:** Python 3.12 / FastAPI / SQLAlchemy / Alembic / authlib.jose / cryptography / pytest (radius-server); TypeScript / Next.js / Drizzle / MariaDB / vitest / Playwright (BackOffice)

**Spec:** `docs/superpowers/specs/2026-11-09-provider-id-sso-design.md`

## Global Constraints

- code: สุ่ม 32 ไบต์, เก็บ SHA-256 เท่านั้น, ใช้ครั้งเดียว, อายุ 60 วินาที; คำขอ authorize ค้างอายุ 10 นาที
- ID token: ES256 พร้อม `kid`, อายุ 5 นาที, claims `iss aud sub iat exp nonce auth_time name preferred_username` เท่านั้น; ไม่มีเลขบัตร, `hash_cid`, อีเมล, token ของ MOPH
- PKCE `S256` เท่านั้น; redirect URI ตรงตัวหนึ่งค่า ไม่มี wildcard
- ออก code/token เฉพาะสมาชิกสถานะ `approved` และตรวจซ้ำตอนแลก token
- ใช้ session portal ที่ค้างอยู่ได้ (ไม่มี `prompt=login`)
- BackOffice: timeout เรียก portal 10 วินาที, JWKS cache 10 นาที, clock skew 60 วินาที; ตั๋วผูกบัญชีอายุ 10 นาที
- ไม่ใส่ code, state, verifier, secret, token, รหัสผ่าน หรือเหตุผลการยกเลิกใน URL, log, audit metadata หรือ outbox
- popup: `FormDialog`/`ActionDialog` ปิดได้จากปุ่มเท่านั้น
- migration additive; BackOffice เรียงใน `packages/db/src/migrate.ts` และแก้ Drizzle schema คู่กัน; radius-server เป็น Alembic `0015`
- ไม่ตั้งค่า → ปุ่มไม่แสดง, route BackOffice 404, endpoint portal 503
- logout BackOffice ไม่เรียก logout portal
- ข้อความ UI ภาษาไทยตาม `CONTEXT.md`/`DESIGN.md`; เวลาเก็บ UTC แสดง Asia/Bangkok
- การผูก/ยกเลิกโดย admin ใช้ `withAdmin` (ผู้ดูแลระบบเท่านั้น); ไม่เพิ่ม permission รายโมดูล

## Review Focus

1. ผู้ใช้กดปุ่ม Provider ID สองแท็บพร้อมกัน → แต่ละแท็บมี state ของตัวเอง; แท็บที่ cookie ถูกเขียนทับต้องได้ `?provider=failed` ไม่ใช่ 500 (ทดสอบใน B4)
2. portal ตอบ HTML (nginx error) แทน JSON ที่ `/oidc/token` → `?provider=unavailable` (B4)
3. กุญแจ portal ถูกหมุน (`kid` ใหม่ไม่อยู่ใน cache) → BackOffice ดึง JWKS ใหม่หนึ่งครั้งก่อนปฏิเสธ (B2)
4. สมาชิกถูกระงับระหว่างอยู่หน้า Provider ID → token endpoint ปฏิเสธ (A3)
5. admin ผูกบุคลากรที่ผูก Provider ID อื่นอยู่แล้ว → 409 `ALREADY_LINKED` ไม่เขียนทับ (B3)

---

## Part A — radius-server (branch `claude/backoffice-sso` ใน repo radius-server, PR แยก)

### Task A1: ตั้งค่า client และกุญแจลงนาม

**Files:**
- Create: `portal/sso/__init__.py`, `portal/sso/config.py`
- Create: `deploy/ubuntu-membership/hospital-backoffice-sso-config` (CLI แบบเดียวกับ `hospital-provider-config`)
- Test: `tests/portal/test_sso_config.py`

**Interfaces:**
- Produces: `SSO_BASE_DIRECTORY = Path('/etc/hospital-backoffice-sso')`; `@dataclass(frozen=True) class SsoClient: client_id: str; secret_sha256: bytes (repr=False); redirect_uri: str`; `@dataclass(frozen=True) class SsoConfig: issuer: str; client: SsoClient; signing_key: authlib JsonWebKey (repr=False); kid: str`; `load_sso_config(directory: Path) -> SsoConfig | None` (ไม่มีไฟล์ → None; ไฟล์ไม่ปลอดภัย/ไม่ครบ → `SsoConfigError`); `SsoClient.secret_matches(secret: str) -> bool` (constant-time)
- ไฟล์ใน directory: `client.env` (`CLIENT_ID`, `REDIRECT_URI`), `client-secret.sha256`, `signing-key.pem` (EC P-256); ตรวจ owner/mode แบบเดียวกับ `portal/provider/config.py`; `issuer` = `PORTAL_ORIGIN`; `kid` = SHA-256 ของ public JWK แบบ thumbprint (RFC 7638)

- [ ] Step 1: เขียน test `test_missing_directory_returns_none`, `test_loads_client_and_key`, `test_redirect_uri_must_be_https_without_wildcard` (`https://x/*`, `http://...` → `SsoConfigError`), `test_rejects_rsa_key`, `test_world_readable_secret_rejected`, `test_secret_matches_constant_time` (ถูก True, ผิด False), `test_repr_hides_secret_and_key`
- [ ] Step 2: `.venv/bin/python -m pytest tests/portal/test_sso_config.py -v` → FAIL (ModuleNotFoundError)
- [ ] Step 3: Implement `portal/sso/config.py`; CLI `set` ถาม secret ด้วย getpass แล้วเก็บเฉพาะ SHA-256, สร้างกุญแจ EC ถ้ายังไม่มี, `status` ไม่แสดงค่าลับ
- [ ] Step 4: รัน test เดิม → PASS
- [ ] Step 5: Commit `feat(sso): load BackOffice SSO client and signing key`

### Task A2: authorize และตาราง

**Files:**
- Create: `portal/sso/models.py`, `portal/sso/routes.py`, `migrations/versions/0015_backoffice_sso.py`
- Modify: `portal/main.py` (include router), `portal/auth/routes.py` (หลัง callback สำเร็จ ถ้ามีคำขอค้างให้ไป `/oidc/resume`)
- Test: `tests/portal/test_sso_authorize.py`, `tests/portal/test_migrations.py`

**Interfaces:**
- Consumes: `load_sso_config`, `resolve_session(db, token)`, `begin_transaction` รูปแบบ cookie browser
- Produces: models `OidcAuthorizationRequest(id_hash PK, browser_hash, client_id, redirect_uri, state, nonce, code_challenge, expires_at)`, `OidcAuthorizationCode(code_hash PK, member_id FK, client_id, redirect_uri, nonce, code_challenge, auth_time, expires_at)`; `issue_code(db, member, request, now) -> str`; routes `GET /oidc/authorize`, `GET /oidc/resume`, `GET /.well-known/openid-configuration`
- `/oidc/authorize` ผิดพลาดก่อนตรวจ redirect URI → หน้า error ของ portal (ไม่ redirect); หลังตรวจแล้ว → redirect `?error=invalid_request&state=`
- สมาชิกไม่ `approved` → หน้า error "บัญชีของคุณยังไม่ได้รับอนุมัติให้ใช้ระบบ Back office" สถานะ 403

- [ ] Step 1: test `test_unconfigured_returns_503`, `test_unknown_client_or_redirect_shows_error_page`, `test_requires_s256_and_nonce`, `test_existing_session_redirects_with_code_and_state`, `test_no_session_stores_request_and_redirects_to_login`, `test_resume_after_provider_login_issues_code` (mock `HealthProviderClient` แบบ test เดิม), `test_resume_with_other_browser_cookie_rejected`, `test_pending_member_refused_403`, `test_discovery_document_lists_endpoints_and_es256`; เพิ่มใน `test_migrations.py` ว่า head = `0015` และสร้างสองตาราง
- [ ] Step 2: `TEST_DATABASE_URL=... .venv/bin/python -m pytest tests/portal/test_sso_authorize.py tests/portal/test_migrations.py -v` → FAIL
- [ ] Step 3: Implement; cookie คำขอค้างชื่อ `hospital_sso_flow` path `/oidc` httpOnly secure samesite=lax
- [ ] Step 4: รัน test เดิม → PASS
- [ ] Step 5: Commit `feat(sso): authorize BackOffice through the portal session`

### Task A3: token และ JWKS

**Files:**
- Modify: `portal/sso/routes.py`; Create: `portal/sso/tokens.py`
- Test: `tests/portal/test_sso_token.py`

**Interfaces:**
- Produces: `POST /oidc/token` (form, `client_secret_basic`) → `{"id_token", "token_type": "Bearer", "expires_in": 300}`; `GET /oidc/jwks` → `{"keys":[public JWK with kid, alg ES256, use sig]}`; `sign_id_token(config, member, *, nonce, auth_time, now) -> str`
- error: OAuth JSON `invalid_client` (401), `invalid_grant` (400), `invalid_request` (400)

- [ ] Step 1: test `test_exchange_returns_verifiable_id_token` (ตรวจด้วย JWKS: iss, aud, sub=member.id, nonce, exp-iat=300), `test_claims_exclude_sensitive_fields` (ไม่มี `hash_cid`, `email`, `cid`), `test_wrong_secret_invalid_client`, `test_wrong_verifier_invalid_grant`, `test_code_single_use`, `test_code_expires_after_60_seconds`, `test_redirect_uri_mismatch_invalid_grant`, `test_member_suspended_after_code_issued_invalid_grant`, `test_logs_contain_no_code_or_secret` (caplog)
- [ ] Step 2: pytest ไฟล์นี้ → FAIL
- [ ] Step 3: Implement ด้วย `authlib.jose.JsonWebToken(['ES256'])`; ลบแถว code ก่อนตรวจ verifier เพื่อให้ใช้ได้ครั้งเดียวเสมอ
- [ ] Step 4: pytest → PASS
- [ ] Step 5: Commit `feat(sso): exchange codes for signed ID tokens`

### Task A4: runbook, nginx และ CI

**Files:**
- Create: `docs/backoffice-sso-runbook.md`, `docs/adr/0010-portal-oidc-provider-for-backoffice.md`
- Modify: `deploy/ubuntu-membership/nginx-portal.conf` (อนุญาต `/oidc/` และ `/.well-known/openid-configuration`), `deploy/ubuntu-membership/install-services.sh` (ติดตั้ง CLI)
- Test: `tests/portal/test_nginx_deployment.py`, `tests/portal/test_deployment.py`

- [ ] Step 1: test ว่า nginx config มี location `/oidc/` ไป upstream เดิม และ install script ติดตั้ง `hospital-backoffice-sso-config` mode 0755 root
- [ ] Step 2: pytest → FAIL
- [ ] Step 3: แก้ไฟล์; runbook: สร้าง secret, ลงทะเบียน redirect URI ของ BackOffice, ตรวจ `status`, ปิดด้วยการลบ directory
- [ ] Step 4: `TEST_DATABASE_URL=... .venv/bin/python -m pytest` ทั้งชุด → PASS ไม่มี skip
- [ ] Step 5: Commit `docs(sso): runbook and ADR for BackOffice SSO`; เปิด PR radius-server

## Part B — BackOffice (branch `claude/project-thread-xno1gg`)

### Task B1: ตารางและ repository

**Files:**
- Create: `packages/db/migrations/0031_provider_sso.sql`, `packages/db/src/schema/external-identity.ts`
- Modify: `packages/db/src/migrate.ts` (เพิ่ม `'0031_provider_sso.sql'` ท้ายรายการ), `packages/db/src/index.ts` (export schema ใหม่)
- Create: `packages/core/src/identity/database-external-identity-repository.ts`
- Test: `packages/core/src/identity/database-external-identity-repository.integration.test.ts`

**Interfaces:**
- Produces (ใน `packages/core/src/identity/external-login-service.ts` ประกาศ interface, repository implement):
  ```ts
  interface ExternalIdentityLink { id: string; personId: string; issuer: string; subject: string; displayName: string | null; linkedByPersonId: string | null; linkedAt: Date }
  interface PendingExternalLogin { id: string; issuer: string; subject: string; displayName: string | null; lastSeenAt: Date }
  interface ExternalIdentityRepository {
    findLink(issuer: string, subject: string): Promise<ExternalIdentityLink | null>;
    findLinkForPerson(personId: string, issuer: string): Promise<ExternalIdentityLink | null>;
    upsertPending(input: { issuer: string; subject: string; displayName: string | null; ticketHash: string; expiresAt: Date; now: Date }): Promise<void>;
    findPendingByTicket(ticketHash: string, now: Date): Promise<PendingExternalLogin | null>;
    findPending(id: string): Promise<PendingExternalLogin | null>;
    listPending(): Promise<PendingExternalLogin[]>;
    listLinks(): Promise<Array<ExternalIdentityLink & { personName: string | null }>>;
    /** insert link + delete pending + audit in one transaction; unique violation → 'ALREADY_LINKED' */
    link(input: { personId: string; issuer: string; subject: string; displayName: string | null; linkedByPersonId: string | null; audit: AuditInput }): Promise<{ ok: true } | { ok: false; code: 'ALREADY_LINKED' }>;
    /** delete link + revoke all sessions of the person + audit in one transaction */
    unlink(input: { personId: string; issuer: string; audit: AuditInput }): Promise<{ ok: true } | { ok: false; code: 'NOT_FOUND' }>;
  }
  ```
- ตารางตาม spec; `CREATE TABLE IF NOT EXISTS`; unique (`issuer`,`subject`) และ (`person_id`,`issuer`) บน `person_external_identity`; unique (`issuer`,`subject`) และ index `token_hash` บน `external_login_pending`

- [ ] Step 1: integration test `links once per subject and per person`, `link removes pending and writes audit in the same transaction` (บังคับ audit ล้มด้วย actor ไม่มีอยู่ → ไม่มี link), `unlink revokes the person's sessions`, `pending ticket expires`, `upsertPending refreshes last_seen_at and ticket`
- [ ] Step 2: `DATABASE_URL=... pnpm --filter @backoffice/core test:integration -- database-external-identity` → FAIL (ถ้าไม่มี MariaDB ให้รายงานว่า skip)
- [ ] Step 3: Implement migration, schema, repository
- [ ] Step 4: รันซ้ำ → PASS; `pnpm --filter @backoffice/db test` → PASS
- [ ] Step 5: Commit `feat(db): store Provider ID links and pending logins`

### Task B2: OIDC client

**Files:**
- Create: `packages/core/src/identity/oidc-client.ts`
- Test: `packages/core/src/identity/oidc-client.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface OidcClientConfig { issuer: string; clientId: string; clientSecret: string; redirectUri: string }
  interface OidcFlow { state: string; nonce: string; verifier: string }
  class PortalOidcClient {
    constructor(config: OidcClientConfig, fetchImpl?: typeof fetch, now?: () => Date);
    begin(): { flow: OidcFlow; url: URL };
    complete(code: string, flow: OidcFlow): Promise<ExternalIdentity>; // throws OidcError
  }
  class OidcError extends Error { code: 'UNAVAILABLE' | 'INVALID' }
  ```
  `ExternalIdentity` จาก `@backoffice/contracts`: แทน `email` ใน `externalIdentitySchema` (`packages/contracts/src/identity.ts`) ด้วย `displayName: z.string().max(255).nullable()` (ไม่มีผู้ใช้ `email` อยู่)
- ตรวจ ES256 ด้วย `createPublicKey({ key: jwk, format: 'jwk' })` + `verify('sha256', data, { key, dsaEncoding: 'ieee-p1363' }, sig)`; JWKS cache 10 นาที, `kid` ไม่รู้จัก → ดึงใหม่หนึ่งครั้ง

- [ ] Step 1: test (สร้างกุญแจ EC ใน test, fetch ปลอม): `begin builds authorize URL with S256 challenge`, `complete returns identity for a valid token`, `rejects wrong iss / aud / nonce / expired (beyond 60s skew) / alg none / RS256 / bad signature` → `INVALID`, `network error, timeout, non-JSON body, 5xx → UNAVAILABLE`, `invalid_grant → INVALID`, `refetches JWKS once for unknown kid`, `caches JWKS for 10 minutes`
- [ ] Step 2: `pnpm --filter @backoffice/core test -- oidc-client` → FAIL
- [ ] Step 3: Implement
- [ ] Step 4: → PASS
- [ ] Step 5: Commit `feat(core): verify portal ID tokens with node:crypto`

### Task B3: ExternalLoginService

**Files:**
- Create: `packages/core/src/identity/external-login-service.ts`; Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/identity/external-login-service.test.ts`

**Interfaces:**
- Consumes: `ExternalIdentityRepository` (B1), `LocalAuthService` (มีอยู่), `LoginAuditRecorder`
- Produces:
  ```ts
  class ExternalLoginService {
    constructor(deps: { repository: ExternalIdentityRepository; localAuth: LocalAuthService; isActivePerson(personId: string): Promise<boolean>; audit: LoginAuditRecorder; now?: () => Date });
    resolve(identity: ExternalIdentity): Promise<{ kind: 'linked'; personId: string } | { kind: 'unlinked'; ticket: string } | { kind: 'inactive' }>;
    linkWithPassword(ticket: string, credentials: LocalCredentials): Promise<{ personId: string; mustChangePassword: boolean }>; // throws 'TICKET_EXPIRED' | 'ALREADY_LINKED' | 'INVALID_CREDENTIALS' | 'LOGIN_LOCKED'
    adminLink(actorPersonId: string, pendingId: string, personId: string): Promise<{ ok: true } | { ok: false; code: 'NOT_FOUND' | 'ALREADY_LINKED' | 'PERSON_NOT_ACTIVE' }>;
    adminUnlink(actorPersonId: string, personId: string, issuer: string): Promise<{ ok: true } | { ok: false; code: 'NOT_FOUND' }>;
  }
  ```
- ตั๋ว: สุ่ม 32 ไบต์ base64url, เก็บ SHA-256, อายุ 10 นาที; audit actions `identity.provider_login`, `identity.provider_link` (`metadata: { method: 'self' | 'admin' }`), `identity.provider_unlink` (`metadata: {}`)

- [ ] Step 1: test (repository ในหน่วยความจำ): `linked active person resolves`, `inactive person → inactive`, `unlinked → ticket and pending row`, `linkWithPassword links and returns mustChangePassword`, `expired ticket refused`, `person already linked to another subject → ALREADY_LINKED`, `wrong password does not link and keeps ticket`, `adminLink of person linked elsewhere → ALREADY_LINKED` (Review Focus 5), `adminUnlink audit metadata has no reason`
- [ ] Step 2: `pnpm --filter @backoffice/core test -- external-login-service` → FAIL
- [ ] Step 3: Implement
- [ ] Step 4: → PASS
- [ ] Step 5: Commit `feat(core): resolve and link Provider ID logins`

### Task B4: routes start/callback/link

**Files:**
- Create: `apps/web/src/lib/provider-sso.ts` (อ่าน env, สร้าง `PortalOidcClient`, เข้ารหัส cookie flow ด้วย AES-256-GCM จาก secret)
- Create: `apps/web/src/app/api/auth/provider/start/route.ts`, `.../callback/route.ts`, `.../link/route.ts` + `route.test.ts` ในแต่ละโฟลเดอร์
- Test: `apps/web/src/lib/provider-sso.test.ts`

**Interfaces:**
- Produces: `providerSsoConfig(): OidcClientConfig | null` (env `PROVIDER_SSO_ISSUER`, `PROVIDER_SSO_CLIENT_ID`, `PROVIDER_SSO_CLIENT_SECRET_FILE`, `PROVIDER_SSO_REDIRECT_URI` ผ่าน `readRuntimeValue`); `providerSsoEnabled(): boolean`
- cookies: `backoffice_provider_flow` (path `/api/auth/provider`, 10 นาที), `backoffice_provider_ticket` (path `/`, 10 นาที) ทั้งคู่ httpOnly, sameSite lax, secure ใน production
- callback redirect: linked → `/` (flow เดิมจัดการเปลี่ยนรหัสผ่าน/เลือกบทบาท); unlinked → `/link-provider`; error → `/?provider=unavailable|failed|inactive`
- link POST: JSON `{ username, password }` → 200 `{ authenticated: true, mustChangePassword }` / 401 `invalid_credentials` / 429 `login_locked` / 409 `already_linked` / 410 `ticket_expired`

- [ ] Step 1: test `start 404 when not configured`, `start redirects to portal and sets flow cookie`, `callback without flow cookie → /?provider=failed` (Review Focus 1), `callback with portal down → /?provider=unavailable`, `callback non-JSON token response → unavailable` (Review Focus 2), `callback linked sets session cookie`, `callback unlinked sets ticket cookie and goes to /link-provider`, `link maps service errors to status codes`, `no code/state/token in any console call` (spy console)
- [ ] Step 2: `pnpm --filter @backoffice/web test -- provider` → FAIL
- [ ] Step 3: Implement
- [ ] Step 4: → PASS
- [ ] Step 5: Commit `feat(web): sign in with Provider ID through the portal`

### Task B5: หน้า login และหน้าผูกบัญชี

**Files:**
- Modify: `apps/web/src/app/page.tsx`, `apps/web/src/app/page.test.tsx`
- Create: `apps/web/src/app/provider-sign-in.tsx` (ปุ่ม + ข้อความ error), `apps/web/src/app/link-provider/page.tsx`, `apps/web/src/app/link-provider/link-provider-form.tsx` + `.test.tsx`

**Interfaces:**
- Consumes: `providerSsoEnabled()` (B4), `POST /api/auth/provider/link`
- ข้อความ: ปุ่ม "เข้าสู่ระบบด้วย Provider ID"; `unavailable` → "ระบบ Provider ID ไม่พร้อมใช้งาน กรุณาใช้ชื่อผู้ใช้และรหัสผ่าน"; `failed` → "เข้าสู่ระบบด้วย Provider ID ไม่สำเร็จ กรุณาลองใหม่"; `inactive` → "บัญชีบุคลากรนี้ไม่ได้อยู่ในสถานะปฏิบัติงาน กรุณาติดต่อผู้ดูแลระบบ"; หน้าผูก: หัวข้อ "ผูกบัญชี Provider ID", "ถ้าไม่มีรหัสผ่าน BackOffice ให้ติดต่อผู้ดูแลระบบเพื่อผูกบัญชี"

- [ ] Step 1: test `hides Provider button when disabled`, `shows button linking to /api/auth/provider/start`, `shows Thai message for each provider query code and ignores unknown codes`, `link form posts credentials and navigates`, `shows already-linked and expired messages`
- [ ] Step 2: `pnpm --filter @backoffice/web test -- page link-provider` → FAIL
- [ ] Step 3: Implement ตาม `DESIGN.md`
- [ ] Step 4: → PASS
- [ ] Step 5: Commit `feat(web): Provider ID button and account link page`

### Task B6: หน้า admin ผูก/ยกเลิก

**Files:**
- Create: `apps/web/src/app/api/admin/provider-links/route.ts` (GET list, POST link), `.../[personId]/route.ts` (DELETE unlink พร้อม `reason` ใน body), `route.test.ts`
- Create: `apps/web/src/app/(app)/admin/provider-links/page.tsx`, `provider-links-manager.tsx` + `.test.tsx`
- Modify: เมนู admin (layout/page เดิม) เพิ่มลิงก์ "บัญชี Provider ID"

**Interfaces:**
- Consumes: `withAdmin`, `adminResult` (เพิ่ม `ALREADY_LINKED: 409` ใน `statusByCode`), `ExternalLoginService.adminLink/adminUnlink`, `person-picker.tsx`
- เหตุผลยกเลิกจำเป็น 1–500 ตัวอักษร; บันทึกในคอลัมน์เหตุผลของ audit ตามรูปแบบที่ admin module ใช้อยู่ ไม่ใส่ใน metadata

- [ ] Step 1: test `non-admin gets 403 before input is read`, `module manager gets 403`, `link conflict returns 409`, `unlink requires reason`, `manager lists pending and linked with Bangkok time`, `link opens FormDialog that does not close on Escape or outside click`, `unlink opens ActionDialog requiring reason`
- [ ] Step 2: `pnpm --filter @backoffice/web test -- provider-links` → FAIL
- [ ] Step 3: Implement
- [ ] Step 4: → PASS
- [ ] Step 5: Commit `feat(admin): link and unlink Provider ID accounts`

### Task B7: e2e, เอกสาร และตรวจครบ

**Files:**
- Create: `apps/web/e2e/provider-sso.spec.ts` (OIDC stub server ใน test ที่ลงนาม ES256)
- Create: `docs/runbooks/provider-sso.md`; Modify: `CONTEXT.md` (คำว่า "บัญชี Provider ID", "รอผูกบัญชี"), `docs/runbooks/local-setup.md` (env ใหม่)

- [ ] Step 1: e2e `linked user signs in`, `unlinked user links with password`, `admin links pending login then user signs in`
- [ ] Step 2: รัน e2e → FAIL ก่อนเชื่อม stub
- [ ] Step 3: เขียน stub และเอกสาร
- [ ] Step 4: `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test`, `DATABASE_URL=... pnpm test:integration`, e2e `--trace off`, `git diff --check` → ผ่านทั้งหมด (รายงาน suite ที่ skip ตามจริง)
- [ ] Step 5: Commit `docs: Provider ID SSO runbook`; เปิด PR BackOffice
