# ระบบลงเวลา — งานที่ 1 ฐานระบบ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship delivery step 1 of the attendance spec: permissions and roles, the foundation tables, a hash-chained audit, settings/shift types/clock-in locations, and kiosk boxes with one-time pairing and signed requests, with the module live in โหมดพัฒนา.

**Architecture:** Same layering as fleet and mass-casualty: zod contracts in `packages/contracts/src/attendance.ts`, additive migration `0033_attendance_foundation.sql` + Drizzle schema, pure helpers + services + queries in `packages/core/src/attendance/`, thin route handlers under `apps/web/src/app/api/attendance/**` (session) and `apps/web/src/app/api/kiosk/**` (device signature, no session), server-component pages under `apps/web/src/app/(app)/attendance/**`, and the full-screen kiosk page at `apps/web/src/app/kiosk/page.tsx` outside the `(app)` group.

**Tech Stack:** TypeScript, Next.js App Router, React, zod, MariaDB via `@backoffice/db`, Drizzle schema, Node `crypto` (ECDSA P-256 verify with `dsaEncoding: 'ieee-p1363'`, SHA-256), WebCrypto in the browser, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-10-attendance-design.md`

## Global Constraints

- Module code `attendance`, href `/attendance`, icon `clock`, group `mine`, label keys `moduleAttendance`/`moduleAttendanceDescription` (already in `th.ts`). Migration seeds `admin_module_setting` row `('attendance', 1, 'DEVELOPMENT')` with `INSERT IGNORE`.
- Permissions: `attendance.manage`, `attendance.device.manage`, `attendance.schedule`, `attendance.audit.read`, each mapped to `'attendance'` in `permissionModules`. Roles: `attendance-manager` → all four; `attendance-scheduler` → `attendance.schedule` (organisation-scoped, granted by หัวหน้าหน่วยงาน in step 2, not grantable from the admin module); `attendance-auditor` → `attendance.audit.read`. `moduleManagerRoles.attendance = 'attendance-manager'`; `grantableRoleSchema` gains `attendance-manager`, `attendance-auditor`; `testerModuleCodes` gains `attendance`.
- Seeded shift types (fixed ids `00000000-0000-4000-b000-00000000000N`): ราชการปกติ 08:30–16:30, เวรเช้า 08:00–16:00, เวรบ่าย 16:00–00:00, เวรดึก 00:00–08:00, เวรข้ามวัน 20:00–08:00; each with early window 60, late grace 0, early-leave grace 0, checkout window 240 minutes. `end <= start` means the shift ends the next day.
- Settings defaults: `gpsMaxAccuracyMeters` 50, `gpsMaxAgeSeconds` 60, `retentionDays` 365, `requestWindowDays` 30, `pinMaxAttempts` 5, `pinLockMinutes` 15, `defaultRadiusMeters` 100.
- Pairing code: 8 digits from `crypto.randomInt`, stored as SHA-256 hex, valid 10 minutes, single use. Device key: ECDSA P-256 public JWK. Signed request headers `x-device-id`, `x-timestamp` (ISO), `x-nonce` (16–64 chars), `x-signature` (base64url P1363); signed string `METHOD\nPATH\nTIMESTAMP\nNONCE\nSHA256HEX(body)`; skew ±60 s; nonce unique per device, rows older than 10 minutes deleted on write.
- Audit metadata holds ids and codes only: never a pairing code, public key, signature, nonce or coordinates. Writes + audit + chain row in one transaction.
- Every popup is `FormDialog`/`ActionDialog` (buttons close it, never Esc or a click outside). Thai copy, Thai validation messages. UTC in DB, Asia/Bangkok on screen.
- Migration additive, every statement idempotent (`IF NOT EXISTS` / `INSERT IGNORE`), no `;` inside literals. Each later delivery step adds its own migration (`0034_…`); this replaces the spec's single `0033_attendance.sql`.
- The migration user has no `TRIGGER` privilege in production, so append-only triggers ship as an admin-run script (Task 7); the hash chain is the tamper evidence that works everywhere.

## Review Focus

1. A captured kiosk request replayed with the same nonce, or replayed 2 minutes later with a fresh nonce but the old signature → `REQUEST_REPLAYED` / `DEVICE_SIGNATURE_INVALID` (Task 5).
2. Two audited actions committing at the same moment → chain `seq` stays gap-free and each `prev_hash` matches the previous row (Task 3, concurrent integration test).
3. A pairing code used twice, used after 10 minutes, or guessed wrong 10 times → refused; the first box stays paired, the code row is spent (Task 5).
4. A revoked box keeps sending heartbeats → 401 `DEVICE_REVOKED`, and `last_seen_at` does not move (Task 5).
5. Module set to OFF → `/api/kiosk/*` returns 503 `MODULE_OFF` even though the path is outside the module gate (Task 6).

---

### Task 1: Contracts, permissions and roles

**Files:**
- Create: `packages/contracts/src/attendance.ts`, `packages/contracts/src/attendance.test.ts`
- Modify: `packages/contracts/src/index.ts`, `packages/contracts/src/access.ts`, `packages/contracts/src/admin.ts`, `packages/core/src/access/policy.ts`, `packages/core/src/access/module-manager-scope.ts`, `packages/core/src/access/authorization-service.test.ts`, `apps/web/src/lib/admin-labels.ts`, `apps/web/src/lib/role-choice-labels.ts`, `packages/i18n/src/th.ts`

**Interfaces (Produces):**
- `ATTENDANCE_MODULE = 'attendance'`
- `attendanceTimeSchema` = string `/^([01]\d|2[0-3]):[0-5]\d$/`
- `attendanceShiftTypeInputSchema` strict `{ name 1–60, startTime, endTime, earlyWindowMinutes int 0–240, lateGraceMinutes int 0–120, earlyLeaveGraceMinutes int 0–120, checkoutWindowMinutes int 30–720, colorHex /^#[0-9A-Fa-f]{6}$/, isActive bool }`; refine: `startTime !== endTime` (message `เวลาเริ่มและเวลาเลิกต้องไม่เท่ากัน`)
- `attendanceLocationInputSchema` strict `{ name 1–100, latitude −90..90, longitude −180..180, radiusMeters int 10–2000, isActive bool }`
- `attendanceDeviceInputSchema` strict `{ name 1–100, locationId uuid }`
- `attendancePublicKeyJwkSchema` strict `{ kty: 'EC', crv: 'P-256', x: base64url 43 chars, y: base64url 43 chars }`
- `attendancePairInputSchema` strict `{ pairingCode /^\d{8}$/, publicKey: attendancePublicKeyJwkSchema }`
- `attendanceSettingsInputSchema` strict with the Global Constraints keys; ranges `gpsMaxAccuracyMeters 5–500`, `gpsMaxAgeSeconds 10–600`, `retentionDays 30–3650`, `requestWindowDays 1–90`, `pinMaxAttempts 3–10`, `pinLockMinutes 1–120`, `defaultRadiusMeters 10–2000`; `type AttendanceSettings`
- `attendanceErrorCodeSchema = z.enum([...spec "การจัดการข้อผิดพลาด" list, 'NOT_FOUND', 'DUPLICATE_NAME', 'PAIRING_CODE_INVALID', 'MODULE_OFF'])`
- Permission and role entries from Global Constraints.

- [ ] **Step 1: Write failing tests** — `attendance.test.ts`: shift type rejects `startTime: '24:00'`, equal start/end, unknown keys, accepts `20:00`→`08:00`; location rejects `latitude: 91`, `radiusMeters: 5`; pair input rejects 7-digit code and `crv: 'P-384'`. `authorization-service.test.ts`: unscoped `attendance-manager` gets `organizationScope(…, 'attendance.device.manage') === 'all'`; `attendance-auditor` gets `'all'` for `attendance.audit.read` and `[]` for `attendance.manage`; `attendance-scheduler` scoped to org X gets `['X']` for `attendance.schedule`.
- [ ] **Step 2: Run** `pnpm --filter @backoffice/contracts test -- attendance && pnpm --filter @backoffice/core test -- authorization` → FAIL (module missing).
- [ ] **Step 3: Implement** the schemas, map entries and roles; add i18n keys `adminRoleAttendanceManager` ผู้จัดการระบบลงเวลา, `adminRoleAttendanceAuditor` ผู้ตรวจสอบระบบลงเวลา, `roleDescAttendanceManager`, `roleDescAttendanceAuditor`, `roleDescAttendanceScheduler` ผู้จัดเวร and wire them in the two label maps (exhaustive Records fail typecheck otherwise).
- [ ] **Step 4: Run** the same commands plus `pnpm typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(attendance): add contracts, permissions and roles`

### Task 2: Migration and Drizzle schema

**Files:**
- Create: `packages/db/migrations/0033_attendance_foundation.sql`, `packages/db/src/schema/attendance.ts`, `packages/db/src/schema/attendance-schema.integration.test.ts`
- Modify: `packages/db/src/migrate.ts` (append version), `packages/db/src/migrate.test.ts`, `packages/db/src/index.ts`

Tables (all `DEFAULT CHARSET=utf8mb4`, `CHAR(36)` ids, `created_at`/`updated_at DATETIME`):
- `attendance_setting (setting_key VARCHAR(64) PK, setting_value VARCHAR(255), updated_by CHAR(36) NULL, updated_at)` seeded with the defaults.
- `attendance_shift_type (id, name VARCHAR(60) UNIQUE, start_minute SMALLINT, end_minute SMALLINT, early_window_minutes, late_grace_minutes, early_leave_grace_minutes, checkout_window_minutes SMALLINT, color_hex CHAR(7), is_active TINYINT(1), sort_order SMALLINT)` seeded with the five types.
- `attendance_location (id, name VARCHAR(100) UNIQUE, latitude DECIMAL(9,6), longitude DECIMAL(9,6), radius_meters SMALLINT, is_active)`.
- `attendance_device (id, name VARCHAR(100), location_id FK, public_key_jwk VARCHAR(512) NULL, paired_at NULL, revoked_at NULL, revoked_by NULL, last_seen_at NULL, created_by FK person, KEY (location_id))`.
- `attendance_device_pairing (id, device_id FK, code_hash CHAR(64) UNIQUE, expires_at, used_at NULL, failed_attempts SMALLINT DEFAULT 0, created_at)`.
- `attendance_request_nonce (device_id FK, nonce VARCHAR(64), created_at, PRIMARY KEY (device_id, nonce), KEY (created_at))`.
- `attendance_hash_chain (seq BIGINT PK, record_type VARCHAR(32), record_id CHAR(36), prev_hash CHAR(64), hash CHAR(64), created_at, UNIQUE (record_type, record_id))` and `attendance_hash_chain_head (id TINYINT PK, last_seq BIGINT, last_hash CHAR(64))` seeded `(1, 0, REPEAT('0', 64))`.
- `INSERT IGNORE INTO admin_module_setting (module_code, enabled, mode, updated_by_person_id, updated_at) VALUES ('attendance', 1, 'DEVELOPMENT', NULL, UTC_TIMESTAMP())`.

- [ ] **Step 1: Write failing test** — after `runMigrations`: five seeded shift types with `ราชการปกติ` at `start_minute 510`, `end_minute 990`; setting `gpsMaxAccuracyMeters` = `'50'`; chain head row `(1, 0, '000…0')`; attendance module mode `DEVELOPMENT`; a second `attendance_request_nonce` row with the same device and nonce fails with `ER_DUP_ENTRY`; running migrations twice changes nothing.
- [ ] **Step 2: Run** `DATABASE_URL=… pnpm --filter @backoffice/db test:integration -- attendance` → FAIL.
- [ ] **Step 3: Implement** SQL, schema file, version list.
- [ ] **Step 4: Run** the integration test and `pnpm --filter @backoffice/db test` → PASS.
- [ ] **Step 5: Commit** `feat(db): add attendance foundation tables (0033)`

### Task 3: Hash-chained audit

**Files:**
- Create: `packages/core/src/attendance/attendance-chain.ts`, `attendance-chain.test.ts`, `attendance-chain.integration.test.ts`, `attendance-db.ts`
- Modify: `packages/core/src/audit/redact.ts` (allow `deviceId`, `locationId`, `shiftTypeId`, `settingKeys`, `revoked`), `packages/core/src/index.ts`

**Interfaces (Produces):**
- `canonicalJson(value: unknown): string` — keys sorted recursively, no whitespace, `Date` as ISO.
- `chainHash(prevHash: string, recordType: string, recordId: string, canonical: string): string` = SHA-256 hex of `prevHash + '\n' + recordType + '\n' + recordId + '\n' + canonical`.
- `chainRecordReaders: Record<'audit_event', (db, id) => Promise<Record<string, unknown> | null>>` — reads the stored row (`id, actor_person_id, action, target_type, target_id, result, metadata, created_at, actor_role`); step 3 adds `'attendance_event'`.
- `appendToChain(tx: Database, recordType, recordId): Promise<{ seq: number; hash: string }>` — `SELECT … FROM attendance_hash_chain_head WHERE id = 1 FOR UPDATE`, read the record back through its reader, insert the chain row, update the head. Must run inside the caller's transaction.
- `attendanceAudit(tx, actorPersonId, action, targetType, targetId, metadata): Promise<void>` — `AuditService.recordAudit` then `appendToChain(tx, 'audit_event', id)`.
- `checkChain(rows: { seq; recordType; recordId; prevHash; hash }[], canonicalOf: (row) => string | null, head: { lastSeq; lastHash }, start = { seq: 0, hash: '0'.repeat(64) }): ChainCheck` — pure; `type ChainCheck = { ok: true; length: number } | { ok: false; brokenAtSeq: number; reason: 'HASH_MISMATCH' | 'RECORD_MISSING' | 'PREV_MISMATCH' | 'SEQ_GAP' | 'HEAD_MISMATCH' }`.
- `verifyChain(db): Promise<ChainCheck>` — loads pages of 500 by `seq`, reads each record through its reader, feeds `checkChain`.
- `attendance-db.ts`: `isDuplicateEntry`, `isMissingReference` re-exported from `../mass-casualty/mci-db`; `attendanceOutbox(tx, type, idempotencyKey, payload)`.

- [ ] **Step 1: Write failing tests** — unit: `canonicalJson({b:1,a:{d:2,c:[3]}}) === '{"a":{"c":[3],"d":2},"b":1}'`; `chainHash` is stable for fixed input (pin the hex). `checkChain` on hand-built rows: a valid 3-row chain → ok 3; middle record's canonical changed → `HASH_MISMATCH` at seq 2; middle row removed → `SEQ_GAP` at 3; a row whose `prevHash` differs → `PREV_MISMATCH`; reader returns null → `RECORD_MISSING`; head `lastSeq` behind the rows → `HEAD_MISMATCH`. Integration (shared CI database, so never delete chain rows; append-only triggers may be installed): three `attendanceAudit` calls in separate transactions → `verifyChain` ok; `UPDATE audit_event SET metadata = '{}'` on the middle one → `{ ok: false, brokenAtSeq: <its seq>, reason: 'HASH_MISMATCH' }`, then restore the original metadata in `finally` and verify is ok again; 10 concurrent `attendanceAudit` transactions → seq gap-free and verify ok; a transaction that throws after `attendanceAudit` leaves neither the audit row nor a chain row.
- [ ] **Step 2: Run** `pnpm --filter @backoffice/core test -- attendance-chain` and `DATABASE_URL=… pnpm --filter @backoffice/core test:integration -- attendance-chain` → FAIL.
- [ ] **Step 3: Implement** the functions above.
- [ ] **Step 4: Run** both → PASS.
- [ ] **Step 5: Commit** `feat(attendance): hash-chain the module's audit events`

### Task 4: Access, settings, shift types and locations

**Files:**
- Create: `packages/core/src/attendance/attendance-access.ts`, `attendance-access.test.ts`, `attendance-settings-service.ts`, `attendance-settings-queries.ts`, `attendance-settings-service.integration.test.ts`, `attendance-test-fixtures.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces (Produces):**
- `canManageAttendance(subject)`, `canManageAttendanceDevices(subject)`, `canReadAttendanceAudit(subject)` — each `authorization.organizationScope(subject, permission) === 'all'`.
- `AttendanceSettingsService(database, createId?)`: `saveSettings(actor, input): Promise<{ ok: true }>`; `saveShiftType(actor, id | null, input): Promise<{ ok: true; id } | { ok: false; code: 'NOT_FOUND' | 'DUPLICATE_NAME' }>`; `saveLocation(actor, id | null, input)` same result type. Rows are switched off, never deleted. Audit actions `attendance.settings.update` (metadata `settingKeys`), `attendance.shift_type.save` (`shiftTypeId`, `isActive`), `attendance.location.save` (`locationId`, `isActive`; no coordinates).
- `AttendanceSettingsQueries(database)`: `settings(): Promise<AttendanceSettings>` (falls back to the Global Constraints defaults for a missing key), `shiftTypes(): Promise<AttendanceShiftTypeRow[]>` (`{ id, name, startTime 'HH:MM', endTime, overnight: boolean, durationMinutes, …input fields, sortOrder }`), `locations(): Promise<AttendanceLocationRow[]>`.
- `ATTENDANCE_SEED.shiftTypes.{office, morning, afternoon, night, overnight}` in fixtures.

- [ ] **Step 1: Write failing tests** — unit: access helpers for plain staff (false), `attendance-manager` (true), `admin` (true), `attendance-auditor` (only `canReadAttendanceAudit`). Integration: seeded `เวรข้ามวัน` reads `overnight: true, durationMinutes: 720`; `เวรบ่าย` 16:00–00:00 reads `overnight: true, durationMinutes: 480`; add + rename a shift type, duplicate name → `DUPLICATE_NAME`, unknown id → `NOT_FOUND`; save settings then read back; each save leaves one audit row and one chain row, and the location audit metadata has no `latitude`.
- [ ] **Step 2: Run** unit + integration commands for `attendance-access` / `attendance-settings` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(attendance): settings, shift types and clock-in locations`

### Task 5: Kiosk boxes, pairing and signed requests

**Files:**
- Create: `packages/core/src/attendance/device-signature.ts`, `device-signature.test.ts`, `device-service.ts`, `device-queries.ts`, `device-service.integration.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces (Produces):**
- `signedPayload(method, path, timestamp, nonce, body: string): string` (format from Global Constraints).
- `verifyDeviceSignature(publicKeyJwk, payload, signatureBase64Url): boolean` — `crypto.createPublicKey({ key: jwk, format: 'jwk' })`, `crypto.verify('sha256', …, { key, dsaEncoding: 'ieee-p1363' }, sig)`; any parse error → `false`.
- `DeviceService(database, createId?, now?: () => Date)`:
  - `create(actor, input): Promise<{ ok: true; id; pairingCode } | { ok: false; code: 'NOT_FOUND' }>` (location must exist and be active).
  - `newPairingCode(actor, deviceId)` → `{ ok: true; pairingCode } | { ok: false; code: 'NOT_FOUND' | 'DEVICE_REVOKED' }`; replaces the box's key on pairing (re-pair a replaced box).
  - `pair(input: AttendancePairInput)` → `{ ok: true; deviceId; deviceName; locationName } | { ok: false; code: 'PAIRING_CODE_INVALID' }` — the code hash must exist, be unused and unexpired; same error for every failure; marks used and stores the key in one transaction; audit `attendance.device.paired` (actor null).
  - `revoke(actor, deviceId)` → `{ ok: true } | { ok: false; code: 'NOT_FOUND' }`; audit `attendance.device.revoked`.
  - `authenticate(request: { deviceId, timestamp, nonce, signature, method, path, body }): Promise<{ ok: true; device: { id; locationId } } | { ok: false; code: 'DEVICE_REVOKED' | 'DEVICE_SIGNATURE_INVALID' | 'REQUEST_REPLAYED' }>` — unknown or unpaired device → `DEVICE_SIGNATURE_INVALID`; revoked → `DEVICE_REVOKED`; `|now − timestamp| > 60 s` or bad signature → `DEVICE_SIGNATURE_INVALID`; nonce insert duplicate → `REQUEST_REPLAYED`; on success sets `last_seen_at`.
- `DeviceQueries(database)`: `list(): Promise<{ id; name; locationId; locationName; paired: boolean; revoked: boolean; lastSeenAt: string | null; online: boolean }[]>` (`online` = last seen within 2 minutes).

- [ ] **Step 1: Write failing tests** — unit (keys from `crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' })`, exported as JWK, signed with `dsaEncoding: 'ieee-p1363'`): valid signature → true; body changed by one byte → false; P-384 key → false; garbage signature → false. Integration with an injected clock: create → pair → authenticate ok; same nonce again → `REQUEST_REPLAYED`; timestamp 61 s old → `DEVICE_SIGNATURE_INVALID`; pairing code reused → `PAIRING_CODE_INVALID` and the first key is kept; code after 10 min 1 s → `PAIRING_CODE_INVALID`; revoke → authenticate `DEVICE_REVOKED` and `last_seen_at` unchanged; `newPairingCode` on a revoked box → `DEVICE_REVOKED`; no audit metadata contains the code or the JWK `x`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(attendance): pair kiosk boxes and verify signed requests`

### Task 6: Web routes, pages and the kiosk pairing screen

**Files:**
- Create: `apps/web/src/app/api/attendance/attendance-route.ts`, `api/attendance/settings/route.ts`, `api/attendance/shift-types/route.ts`, `api/attendance/shift-types/[id]/route.ts`, `api/attendance/locations/route.ts`, `api/attendance/locations/[id]/route.ts`, `api/attendance/devices/route.ts`, `api/attendance/devices/[id]/pairing-code/route.ts`, `api/attendance/devices/[id]/revoke/route.ts`, `api/attendance/audit/verify/route.ts`, `api/attendance/route.test.ts`; `apps/web/src/app/api/kiosk/kiosk-route.ts`, `api/kiosk/pair/route.ts`, `api/kiosk/heartbeat/route.ts`, `api/kiosk/route.test.ts`; `apps/web/src/app/(app)/attendance/layout.tsx`, `page.tsx`, `attendance-page.tsx`, `settings/page.tsx`, `settings/settings-forms.tsx`, `settings/settings-forms.test.tsx`, `devices/page.tsx`, `devices/device-forms.tsx`, `devices/device-forms.test.tsx`, `audit/page.tsx`, `audit/verify-chain-button.tsx`; `apps/web/src/app/kiosk/page.tsx`, `kiosk/kiosk-pairing.tsx`, `kiosk/kiosk-pairing.test.tsx`, `apps/web/src/lib/kiosk-key.ts`, `kiosk-key.test.ts`, `apps/web/src/lib/attendance-labels.ts`
- Modify: `apps/web/src/lib/modules.ts` (replace `planned('attendance', …)` with a live `withSections` entry), `apps/web/src/lib/modules.test.ts`, `apps/web/src/lib/module-gate.test.ts`, `apps/web/src/app/styles.css`

**Interfaces:**
- Consumes Tasks 3–5. Session routes use `withSessionAndDatabase`, `readInput`, `forbidden` from `../hr/profile-route` and map result codes like `mciResult` (`NOT_FOUND` 404, `DUPLICATE_NAME` 409, `DEVICE_REVOKED` 409, else 400).
- `kiosk-route.ts`: `withDevice(request, action: (device, database, body: string) => Promise<Response>)` — returns 503 `MODULE_OFF` when `modeOf(readModuleModes(db), 'attendance') === 'OFF'`, 401 `{ error: code }` when `DeviceService.authenticate` fails. `POST /api/kiosk/pair` is unsigned (input schema only) and rate-limited to 10 tries/minute per client IP with the existing login-throttle helper if it fits, else an in-memory limiter documented as per-instance. `POST /api/kiosk/heartbeat` returns `{ serverTime: ISO, deviceName, locationName }`.
- `kiosk-key.ts`: `loadOrCreateKey(): Promise<{ publicJwk; sign(payload: string): Promise<string> }>` — WebCrypto `generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])`, stored in IndexedDB `attendance-kiosk`/`keys`; `signedFetch(path, body, device)` sets the four headers.
- Sections: `/attendance/settings` (`canManageAttendance`), `/attendance/devices` (`canManageAttendanceDevices`), `/attendance/audit` (`canReadAttendanceAudit`). `/attendance` redirects to the first visible section, else shows `ยังไม่มีหน้าที่คุณใช้ได้ในระบบลงเวลา`.
- Pages: settings (ค่าตั้ง form, shift-type table + add/edit FormDialog showing "ข้ามวัน" for overnight), devices (location table + FormDialog; device table with ออนไลน์/ออฟไลน์/ยังไม่จับคู่/ถอนสิทธิ์แล้ว, "สร้างรหัสจับคู่" shows the 8 digits once in an ActionDialog, "ถอนสิทธิ์" ActionDialog), audit (ปุ่ม "ตรวจสอบความต่อเนื่อง" → shows `ต่อเนื่องครบ N รายการ` or `พบความผิดปกติที่ลำดับ N`).
- `/kiosk`: full screen; no key or not paired → 8-digit input + "จับคู่เครื่อง"; paired → device and location name, big server clock from heartbeat every 60 s, text `ช่องทางลงเวลาจะเปิดในขั้นถัดไป` (honest placeholder; no clock-in buttons yet).

- [ ] **Step 1: Write failing tests** — `api/attendance/route.test.ts`: plain staff gets 403 on every write; manager creates a location (201), a shift type with a duplicate name (409); auditor 403 on settings but 200 on verify. `api/kiosk/route.test.ts`: pair with a good code (200) then heartbeat signed with the test key (200 with `serverTime`); same nonce (401 `REQUEST_REPLAYED`); module OFF (503 `MODULE_OFF`). `kiosk-key.test.ts`: signature from `loadOrCreateKey` verifies with `verifyDeviceSignature` (use `fake-indexeddb` only if already a dev dependency; otherwise inject the store). Component tests: shift-type FormDialog does not close on Escape or backdrop click and shows `เวลาเริ่มและเวลาเลิกต้องไม่เท่ากัน`; pairing screen rejects a 7-digit code with `กรอกรหัสจับคู่ 8 หลัก`. `modules.test.ts`: attendance entry is live, group `mine`, sections empty for staff and all three for a manager.
- [ ] **Step 2: Run** `pnpm --filter @backoffice/web test -- attendance kiosk modules module-gate` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same → PASS, then `pnpm lint && pnpm typecheck`.
- [ ] **Step 5: Commit** `feat(web): attendance settings, devices, audit and kiosk pairing`

### Task 7: Append-only guard script, docs and verification

**Files:**
- Create: `infra/attendance/append-only-guards.sql`, `packages/db/src/attendance-guards.integration.test.ts`
- Modify: `CONTEXT.md` (terms: **จุดลงเวลา**, **กล่องลงเวลา**, **รหัสจับคู่**, **ประเภทเวร**, **ช่วงเวร**, **ผลประเมินการลงเวลา**, **รายการรอตรวจสอบ**, **ผู้จัดเวร**, **ผู้ตรวจสอบระบบลงเวลา**; keep existing **รายการลงเวลา** and **คำอุทธรณ์การลงเวลา**), `docs/runbooks/deploy.md` (run the guard script as the DB admin after migrating), `infra/backup/restore-verify.test.sh` (include `attendance_hash_chain` in the restored-table check), `docs/superpowers/specs/2026-11-10-attendance-design.md` (per-step migrations; triggers via admin script; chain covers events)

`append-only-guards.sql`: `CREATE TRIGGER IF NOT EXISTS attendance_hash_chain_no_update BEFORE UPDATE ON attendance_hash_chain FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'attendance_append_only'` and the matching `BEFORE DELETE`; later steps append the event/review/void/adjustment tables.

- [ ] **Step 1: Write failing test** — with `DATABASE_ADMIN_URL` (skip and say so without it): apply the script twice (idempotent), then as `DATABASE_URL` an `UPDATE attendance_hash_chain SET hash = hash WHERE seq = <max>` fails with `attendance_append_only` and `DELETE … WHERE seq = <max>` fails the same way. The triggers stay installed (no test deletes chain rows), so later runs keep passing.
- [ ] **Step 2: Run** `DATABASE_URL=… DATABASE_ADMIN_URL=… pnpm --filter @backoffice/db test:integration -- attendance-guards` → FAIL.
- [ ] **Step 3: Implement** the script, docs and spec edits.
- [ ] **Step 4: Verify** — `pnpm lint && pnpm typecheck && pnpm test`, `DATABASE_URL=… DATABASE_ADMIN_URL=… pnpm test:integration`, `pnpm --filter @backoffice/db migrate`, `bash infra/backup/restore-verify.test.sh`, `git diff --check`; record the real output in the PR.
- [ ] **Step 5: Commit** `docs(attendance): append-only guard script and domain terms`, push, open the PR, request review.
