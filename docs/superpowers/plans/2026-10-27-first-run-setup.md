# First-run Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เว็บที่ยังไม่มีค่าเชื่อมฐานข้อมูลเปิดหน้า `/setup` ให้ผู้ติดตั้งกรอกค่าเชื่อม MariaDB สร้าง super admin คนแรก แล้วปิดหน้า setup ถาวร

**Architecture:** `packages/db` ได้ตัวหาค่า `DATABASE_URL` แบบ 3 แหล่ง (env, `_FILE`, ไฟล์ใน config dir) ที่เว็บและ worker ใช้ร่วมกัน `packages/core` ได้ `FirstRunSetup` (ทดสอบการเชื่อมต่อ, รัน migration, สร้างบัญชีใน transaction เดียว) และ `expandSuperAdmin` ที่ `SessionService` เรียกจุดเดียว เว็บมีที่เก็บรหัส setup บน `globalThis`, route `/api/setup/*`, หน้า `/setup` และเขียนไฟล์ config แบบ atomic

**Tech Stack:** TypeScript, Next.js 16 (App Router, standalone), zod, mysql2, Vitest, Playwright, MariaDB 11.8, Docker Compose

**Spec:** `docs/superpowers/specs/2026-10-27-first-run-setup-design.md`

## Global Constraints

- ลำดับหาค่า: env `DATABASE_URL` > ไฟล์ `DATABASE_URL_FILE` > `${BACKOFFICE_CONFIG_DIR}/database_url`; ค่าเริ่มต้น `BACKOFFICE_CONFIG_DIR=/var/lib/backoffice/config`
- รหัส setup: 12 ตัวจาก `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` แสดง `XXXX-XXXX-XXXX`; log บรรทัด `backoffice.setup.code XXXX-XXXX-XXXX`; ผิด 5 ครั้งสุ่มใหม่; เก็บแค่ SHA-256
- รหัสผ่าน admin อย่างน้อย 12 ตัว; port 1–65535 ค่าเริ่มต้น 3306; ชื่อฐานเริ่มต้น `backoffice`; MariaDB ≥ 10.6
- ไฟล์ config mode `0600` เขียนแบบ temp + `rename`
- บทบาท `super-admin`; โมดูลเจ้าของข้อมูล `hr`, `leave`, `official-travel`, `room-booking`, `inventory`, `requests`
- audit action `system.setup.completed` metadata มีแค่ `{ serverVersion, migrationsApplied }`
- รหัส error: `invalid_code`, `connection_failed`, `access_denied`, `migration_privilege_missing`, `unsupported_server`, `accounts_exist`, `keys_missing`, `invalid_input`, `already_configured`, `config_write_failed`
- ห้ามรหัสผ่านฐาน, รหัสผ่าน admin, เลขบัตร, รหัส setup, URL ฐาน อยู่ใน URL, log, audit metadata, response
- worker log `backoffice.worker.waiting_for_database_config` ครั้งเดียว ตรวจซ้ำทุก 10 วินาที
- ข้อความ UI ภาษาไทยผ่าน `packages/i18n/src/th.ts` ตาม `DESIGN.md` และคำใน `CONTEXT.md`

## Review Focus

1. รหัสผ่านฐานมี `@`, `/`, `:`, `#`, `%` — URL ที่สร้างต้องต่อได้จริง (test ใน Task 4: integration ใช้รหัสผ่าน `p@ss/w:rd#%1`)
2. ส่งคำขอ complete สองครั้งพร้อมกัน — ต้องได้ admin คนเดียว อีกคำขอได้ `already_configured` (test ใน Task 6)
3. driver error มีข้อความที่มี host/ผู้ใช้ — response และ log ต้องไม่มี (test ใน Task 6 ตรวจ body ไม่มี host/password)
4. volume config เขียนไม่ได้ (read-only) — ตอบ `config_write_failed` ไม่ crash และ setup ยังเปิดอยู่ (test ใน Task 5)
5. เปิด `/setup` หลังตั้งค่าแล้ว หรือเมื่อ operator ตั้ง `DATABASE_URL` เอง — ต้อง 404 (test ใน Task 7)

---

### Task 1: ตัวหาค่า DATABASE_URL และ migration ที่ยังไม่ได้รัน (`packages/db`)

**Files:**
- Modify: `packages/db/src/runtime-env.ts`, `packages/db/src/migrate.ts`, `packages/db/src/index.ts`
- Test: `packages/db/src/runtime-env.test.ts`, `packages/db/src/migrate.test.ts`, `packages/db/src/migrate.integration.test.ts` (create)

**Interfaces:**
- Produces:
  - `readDatabaseUrl(env?: NodeJS.ProcessEnv): string | undefined`
  - `databaseConfigFilePath(env?: NodeJS.ProcessEnv): string` → `${BACKOFFICE_CONFIG_DIR ?? '/var/lib/backoffice/config'}/database_url`
  - `migrationVersions: readonly string[]` (ลำดับเดิมใน `migrate.ts`)
  - `runMigrations(db: Database, options?: { migrationsDir?: string }): Promise<string[]>` คืน version ที่รันรอบนี้
  - `pendingMigrations(db: Pick<Database,'query'>): Promise<string[]>` — ถ้าไม่มีตาราง `schema_migration` คืนทั้งหมด (ตรวจด้วย `information_schema.tables` ของ `DATABASE()` ไม่ใช้ `CREATE`)

- [ ] **Step 1: เขียน test ที่ล้ม**

```ts
it('prefers env, then _FILE, then the config dir file', () => {
  expect(readDatabaseUrl({ DATABASE_URL: 'mysql://a' })).toBe('mysql://a');
  expect(readDatabaseUrl({ DATABASE_URL_FILE: fileWith('mysql://b') })).toBe('mysql://b');
  expect(readDatabaseUrl({ BACKOFFICE_CONFIG_DIR: dirWith('database_url', 'mysql://c\n') })).toBe('mysql://c');
  expect(readDatabaseUrl({ BACKOFFICE_CONFIG_DIR: emptyDir() })).toBeUndefined();
});
it('defaults the config path', () => expect(databaseConfigFilePath({})).toBe('/var/lib/backoffice/config/database_url'));
it('reads migrations from the given directory', async () => { /* fake db records executes */ expect(await runMigrations(fakeDb, { migrationsDir: tmpDirWith('0000_r0_foundation.sql', 'CREATE TABLE IF NOT EXISTS t (id INT)') })).toContain('0000_r0_foundation.sql'); });
```

Integration (`describe.skip` ถ้าไม่มี `DATABASE_URL`, ใช้ฐานชั่วคราวชื่อสุ่ม): ฐานว่าง `pendingMigrations` คืน 16 รายการ; หลัง `runMigrations` คืน `[]`

- [ ] **Step 2: รัน `pnpm --filter @backoffice/db test` — คาดว่า FAIL (`readDatabaseUrl` ไม่มี)**
- [ ] **Step 3: implement** ไฟล์ที่ไม่มีอยู่ (ENOENT) ถือว่าไม่มีค่า; error อื่นโยนต่อ
- [ ] **Step 4: รัน `pnpm --filter @backoffice/db test` — PASS; `pnpm --filter @backoffice/db typecheck` — ผ่าน**
- [ ] **Step 5: Commit** `feat(db): resolve DATABASE_URL from a config dir and list pending migrations`

### Task 2: schema ของฟอร์ม setup (`packages/contracts`)

**Files:**
- Create: `packages/contracts/src/setup.ts`, `packages/contracts/src/setup.test.ts`
- Modify: `packages/contracts/src/index.ts`

**Interfaces:**
- Produces:
  - `isValidThaiNationalId(value: string): boolean` (13 หลัก, หลักสุดท้าย = `(11 - (Σ d[i]*(13-i), i=0..11) % 11) % 10`)
  - `setupDatabaseSchema` → `{ host: string(1..255, trim), port: int 1..65535 default 3306, database: /^[A-Za-z0-9_]{1,64}$/ default 'backoffice', username: string(1..80), password: string(0..1024) }`
  - `setupAdminSchema` → `{ displayName: string(1..255), employeeCode: string(1..32), nationalId: refine isValidThaiNationalId, username: /^[a-z0-9._-]{3,64}$/, password: string(12..1024) }`
  - `setupTestConnectionSchema = { code: string, database }`, `setupCompleteSchema = { code: string, database, admin }`
  - `setupErrorCodes` (tuple ของรหัส error ใน Global Constraints) และ `type SetupErrorCode`
  - types `SetupDatabaseInput`, `SetupAdminInput`

- [ ] **Step 1: เขียน test ที่ล้ม** — `isValidThaiNationalId('1101700230703')` true, `'1101700230704'` false, `'110170023070'` false; admin password 11 ตัว reject; port `0` และ `70000` reject; database `'back-office'` reject; defaults port 3306 / database `backoffice`
- [ ] **Step 2: รัน `pnpm --filter @backoffice/contracts test` — FAIL**
- [ ] **Step 3: implement**
- [ ] **Step 4: รันอีกครั้ง — PASS**
- [ ] **Step 5: Commit** `feat(contracts): validate first-run setup input`

### Task 3: super admin (`packages/core/src/access`, `identity`)

**Files:**
- Create: `packages/core/src/access/super-admin.ts`, `packages/core/src/access/super-admin.test.ts`
- Modify: `packages/core/src/access/policy.ts`, `packages/core/src/identity/session-service.ts`, `packages/core/src/identity/session-service.test.ts`, `packages/core/src/index.ts`, `CONTEXT.md`

**Interfaces:**
- Produces:
  - `superAdminRoleName = 'super-admin'`
  - `knownRoleNames(): string[]` (keys ของ `permissionsByRole`) และ `dataOwnerModuleCodes: readonly string[]` ใน `policy.ts`
  - `expandSuperAdmin<T extends Pick<AccessSubject,'roles'|'dataOwnerModules'|'hospitalWideDataOwnerModules'>>(access: T): T`

- [ ] **Step 1: เขียน test ที่ล้ม**

```ts
it('leaves other people unchanged', () => expect(expandSuperAdmin(hrManagerAccess)).toEqual(hrManagerAccess));
it('grants every role hospital-wide and every data-owner module', () => {
  const access = expandSuperAdmin({ roles: [{ name: 'super-admin', organizationId: null }], dataOwnerModules: [], hospitalWideDataOwnerModules: [] });
  for (const name of knownRoleNames()) expect(access.roles).toContainEqual({ name, organizationId: null });
  expect(access.hospitalWideDataOwnerModules).toEqual([...dataOwnerModuleCodes]);
});
it('passes every permission in AuthorizationService', async () => { /* for each permissionSchema option: canAccess(...) allowed for moduleCode 'hr' and 'room-booking' */ });
it('does not duplicate a role the person already holds hospital-wide', ...);
```

session-service test: loader คืน super-admin → `resolve()` ได้ `roles` ที่มี `hr-manager`

- [ ] **Step 2: รัน `pnpm --filter @backoffice/core test -- super-admin session-service` — FAIL**
- [ ] **Step 3: implement** และเรียก `expandSuperAdmin` ใน `SessionService.resolve` หลัง `this.access.load`; เพิ่มคำ **ผู้ดูแลระบบสูงสุด** ใน `CONTEXT.md` ตาม spec ข้อ 6
- [ ] **Step 4: รันอีกครั้ง — PASS**
- [ ] **Step 5: Commit** `feat(access): super-admin role holds every role and data-owner module`

### Task 4: บริการ FirstRunSetup (`packages/core/src/setup`)

**Files:**
- Create: `packages/core/src/setup/first-run-setup.ts`, `packages/core/src/setup/database-url.ts`, `packages/core/src/setup/first-run-setup.test.ts`, `packages/core/src/setup/first-run-setup.integration.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: Task 1 `runMigrations`, `pendingMigrations`; Task 2 schemas/types; Task 3 `superAdminRoleName`; `hashPassword`, `NationalIdProtector`, `AuditService`, `DatabaseAuditRepository`
- Produces:
  - `buildDatabaseUrl(input: SetupDatabaseInput): string` — `mysql://${enc(user)}:${enc(pw)}@${host}:${port}/${database}` (host ที่เป็น IPv6 ใส่ `[ ]`)
  - `class SetupError extends Error { constructor(readonly code: SetupErrorCode) }`
  - `interface FirstRunSetupDeps { connect(url: string): Database; protector: NationalIdProtector | null; migrationsDir: string; createId?: () => string }`
  - `class FirstRunSetup { testConnection(input: SetupDatabaseInput): Promise<{ serverVersion: string; pendingMigrations: number; hasAccounts: boolean }>; complete(database: SetupDatabaseInput, admin: SetupAdminInput): Promise<{ databaseUrl: string; personId: string; serverVersion: string; migrationsApplied: number }> }`
  - ทั้งสอง method ปิด pool ที่เปิดเองเสมอ (`finally`) และแปลง driver error: `ER_ACCESS_DENIED_ERROR`/`ER_DBACCESS_DENIED_ERROR` → `access_denied`; `ECONNREFUSED`/`ETIMEDOUT`/`ENOTFOUND`/`ER_BAD_DB_ERROR` → `connection_failed`; ระหว่าง migration `1142`/`1044` → `migration_privilege_missing`; version ไม่ใช่ MariaDB หรือ < 10.6 → `unsupported_server`; `protector === null` → `keys_missing`; มี `local_account` → `accounts_exist`

- [ ] **Step 1: เขียน unit test ที่ล้ม** (fake `Database`): `buildDatabaseUrl({ password: 'p@ss/w:rd#%1', ... })` แล้ว `new URL(...)` ได้ `decodeURIComponent(password)` เท่าเดิม; version `'10.5.9-MariaDB'` → `unsupported_server`; `'8.0.36'` → `unsupported_server`; protector null → `keys_missing` ก่อนเชื่อมต่อ; มีบัญชี → `accounts_exist`; pool ถูก `close()` ทุกกรณี
- [ ] **Step 2: เขียน integration test ที่ล้ม** (ข้ามเมื่อไม่มี `DATABASE_URL`; สร้างฐาน/ผู้ใช้ชั่วคราวด้วย root):
  - ฐานว่าง + ผู้ใช้รหัสผ่าน `p@ss/w:rd#%1` ที่มีสิทธิ์ DDL: `complete` ได้ `migrationsApplied === 16`; มีแถว person (`employee_code`, `display_name`, `national_id_masked`), `local_account` ที่ `LocalAuthService` ล็อกอินได้, `role_assignment` super-admin `organization_id IS NULL`, `audit_event` `system.setup.completed` ที่ metadata ไม่มีเลขบัตร/รหัสผ่าน
  - ฐานที่ migrate แล้ว + ผู้ใช้ DML อย่างเดียว: ผ่าน `migrationsApplied === 0`
  - ฐานว่าง + ผู้ใช้ DML อย่างเดียว: `migration_privilege_missing`
  - ฐานที่มีบัญชี: `accounts_exist` และจำนวนแถว `person` ไม่เปลี่ยน
  - `employeeCode` ซ้ำกับที่มีใน person (ไม่มีบัญชี): transaction rollback ไม่มีแถว `local_account`/`role_assignment` ค้าง
- [ ] **Step 3: รัน `pnpm --filter @backoffice/core test -- first-run-setup` — FAIL**
- [ ] **Step 4: implement** — insert ทั้งหมดใน `db.transaction`; `role` ใช้ `INSERT IGNORE` แล้ว `SELECT id`
- [ ] **Step 5: รัน unit — PASS; รัน `DATABASE_URL=... pnpm --filter @backoffice/core test:integration -- first-run-setup` — PASS**
- [ ] **Step 6: Commit** `feat(setup): connect, migrate and create the first super admin`

### Task 5: โหมด setup ฝั่งเว็บ (รหัส, ไฟล์ config, redirect, health)

**Files:**
- Create: `apps/web/src/lib/setup-code.ts`, `apps/web/src/lib/setup-config.ts`, `apps/web/src/lib/setup-mode.ts`, `apps/web/src/instrumentation.ts` และ test คู่กัน
- Modify: `apps/web/src/lib/runtime-env.ts`, `apps/web/src/lib/database.ts`, `apps/web/src/app/page.tsx`, `apps/web/src/app/(app)/layout.tsx`, `apps/web/src/app/api/health/route.ts`

**Interfaces:**
- Consumes: Task 1 `readDatabaseUrl`, `databaseConfigFilePath`
- Produces:
  - `isSetupMode(env?): boolean` = `readDatabaseUrl(env) === undefined`
  - `issueSetupCode(log?: (line: string) => void): void` — สุ่มและ log ถ้ายังไม่มี; state ที่ `globalThis[Symbol.for('backoffice.setupCode')]` = `{ hash, failures }` (instrumentation กับ route อยู่คนละ bundle)
  - `verifySetupCode(code: string, log?): boolean` — ตัด `-`/ช่องว่าง, ไม่สนตัวพิมพ์; ผิดครั้งที่ 5 เรียก issue ใหม่; ถ้ายังไม่มีรหัสให้ issue ก่อน
  - `clearSetupCode(): void`
  - `writeDatabaseConfig(url: string, path?: string): Promise<void>` — `mkdir -p` dir, เขียน `${path}.tmp-${random}` mode `0o600`, `rename`; error โยน `SetupError('config_write_failed')`
  - `getSharedDatabase()` ใช้ `readDatabaseUrl()`
  - `migrationsDir(env?, cwd?): string` = `env.BACKOFFICE_MIGRATIONS_DIR ?? resolve(cwd, '../../packages/db/migrations')`

- [ ] **Step 1: เขียน test ที่ล้ม**
  - รหัสที่ log ตรง `/^backoffice\.setup\.code [A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/`; `verifySetupCode` รับรหัสนั้นแบบตัวเล็กไม่มีขีด; ผิด 5 ครั้งแล้วรหัสเดิมใช้ไม่ได้และ log บรรทัดใหม่
  - `writeDatabaseConfig` ได้ไฟล์ mode `0o600` เนื้อหาตรง, ไม่มี `.tmp-` ค้าง; dir read-only (`chmod 0o500`) โยน `config_write_failed` (ข้ามเมื่อ `process.getuid?.() === 0` เพราะ root เขียนได้เสมอ; ใช้ path ใต้ไฟล์ปกติแทน เช่น `<file>/database_url` ซึ่งได้ ENOTDIR ทุกผู้ใช้)
  - `/api/health` ในโหมด setup ตอบ 200 `{ status: 'setup-required' }`, ปกติ `{ status: 'ok' }`
  - `HomePage` ในโหมด setup เรียก `redirect('/setup')` (mock `next/navigation` แบบ test เดิมใน `page.test.tsx`)
- [ ] **Step 2: รัน `pnpm --filter @backoffice/web test -- setup health page` — FAIL**
- [ ] **Step 3: implement**; `instrumentation.ts`: `export async function register() { if (process.env.NEXT_RUNTIME === 'nodejs' && isSetupMode()) issueSetupCode(); }`
- [ ] **Step 4: รันอีกครั้ง — PASS**
- [ ] **Step 5: Commit** `feat(web): detect setup mode and issue a one-time setup code`

### Task 6: API `/api/setup/test-connection` และ `/api/setup/complete`

**Files:**
- Create: `apps/web/src/app/api/setup/test-connection/route.ts`, `apps/web/src/app/api/setup/complete/route.ts`, `apps/web/src/lib/setup-service.ts`, route tests

**Interfaces:**
- Consumes: Task 2 schemas, Task 4 `FirstRunSetup`/`SetupError`, Task 5 helpers, `getNationalIdProtector()`
- Produces:
  - `createFirstRunSetup(): FirstRunSetup` ใน `setup-service.ts` (`connect: (url) => createDatabase(url)`; pool ขนาด 1 ผ่าน `?connectionLimit=1`)
  - Response: สำเร็จ `200 { ok: true, ... }`; `SetupError` → `400 { ok: false, error: code }` ยกเว้น `invalid_code` → `403`; นอกโหมด setup → `404`; อื่น ๆ → `500 { ok: false, error: 'connection_failed' }` และ log `backoffice.setup.failed { code }` เท่านั้น
  - `complete` ใช้ promise lock บน `globalThis` — ระหว่างทำงานคำขอที่สองได้ `409 already_configured`; สำเร็จแล้ว `writeDatabaseConfig` → `clearSetupCode()` → audit ถูกเขียนใน Task 4 แล้ว

- [ ] **Step 1: เขียน test ที่ล้ม** (mock `FirstRunSetup`): ไม่อยู่โหมด setup → 404; รหัสผิด → 403 และไม่เรียก setup; body ไม่ผ่าน zod → 400 `invalid_input`; setup โยน `Error('connect ECONNREFUSED 192.168.1.254:3306 user backoffice')` → body ไม่มี `192.168.1.254` และ `backoffice` และ `console.error` ไม่ถูกเรียกด้วยข้อความนั้น; ยิง complete 2 ครั้งพร้อมกัน → `[200, 409]` และ `complete` ถูกเรียกครั้งเดียว; `writeDatabaseConfig` ล้ม → 500 `config_write_failed` และ `clearSetupCode` ไม่ถูกเรียก
- [ ] **Step 2: รัน `pnpm --filter @backoffice/web test -- api/setup` — FAIL**
- [ ] **Step 3: implement**
- [ ] **Step 4: รันอีกครั้ง — PASS**
- [ ] **Step 5: Commit** `feat(web): setup API for connection test and completion`

### Task 7: หน้า `/setup`

**Files:**
- Create: `apps/web/src/app/setup/page.tsx`, `apps/web/src/app/setup/setup-form.tsx`, `apps/web/src/app/setup/page.test.tsx`, `apps/web/src/app/setup/setup-form.test.tsx`, `apps/web/e2e/first-run-setup.spec.ts`
- Modify: `packages/i18n/src/th.ts`, `apps/web/src/app/styles.css` (เฉพาะถ้าคลาสเดิมไม่พอ)

**Interfaces:**
- Consumes: Task 5 `isSetupMode`, Task 6 API, `readRuntimeValue`
- Produces: server page — นอกโหมด setup `notFound()`; คำนวณ `missingKeys: string[]` จาก `BACKOFFICE_SESSION_SECRET`, `NATIONAL_ID_ENCRYPTION_KEY`, `NATIONAL_ID_LOOKUP_KEY` แล้วส่งให้ `<SetupForm missingKeys={...} />`

ข้อความ (เพิ่มใน `th.ts` ขึ้นต้น `setup`): หัวข้อ "ตั้งค่าระบบครั้งแรก"; ส่วน "ยืนยันสิทธิ์ติดตั้ง" / "ฐานข้อมูล" / "บัญชีผู้ดูแลระบบสูงสุด"; คำอธิบายรหัส "ดูรหัสได้จากคำสั่ง docker compose logs web บนเซิร์ฟเวอร์"; ปุ่ม "ทดสอบการเชื่อมต่อ", "บันทึกและสร้างบัญชี"; คำเตือน root "ควรใช้ผู้ใช้ฐานข้อมูลเฉพาะของระบบ ไม่ใช่ root"; ข้อความต่อ error code หนึ่งข้อความต่อรหัส; หลังสำเร็จ "ตั้งค่าเสร็จแล้ว เข้าสู่ระบบด้วยบัญชีที่สร้าง" แล้วไป `/`

- [ ] **Step 1: เขียน test ที่ล้ม** — page นอกโหมด setup เรียก `notFound`; มี `missingKeys` แสดงชื่อตัวแปรและปุ่มบันทึก `disabled`; ฟอร์ม: กด "ทดสอบการเชื่อมต่อ" แสดง "MariaDB 11.8" และ "migration ที่ยังไม่ได้รัน 16 รายการ"; รหัสผ่านยืนยันไม่ตรงไม่ส่งคำขอ; ชื่อผู้ใช้ `root` แสดงคำเตือน; error `migration_privilege_missing` แสดงข้อความไทยที่กำหนด; ช่องรหัสผ่านทุกช่อง `type="password"` และ `autoComplete="new-password"`
- [ ] **Step 2: รัน `pnpm --filter @backoffice/web test -- setup` — FAIL**
- [ ] **Step 3: implement** ตาม `DESIGN.md` (ใช้คลาสฟอร์มที่มีอยู่, label ทุกช่อง, `role="alert"` สำหรับ error)
- [ ] **Step 4: รันอีกครั้ง — PASS**
- [ ] **Step 5: เขียน e2e** `first-run-setup.spec.ts`: เปิด `/` → อยู่ `/setup`; อ่านรหัสจาก env `E2E_SETUP_CODE`; กรอก → สำเร็จ → ล็อกอิน → เปิด `/hr` ได้ → `/setup` ตอบ 404 (ข้ามเมื่อไม่มี `E2E_SETUP_CODE`)
- [ ] **Step 6: Commit** `feat(web): first-run setup page`

### Task 8: worker รอค่าเชื่อมฐาน

**Files:**
- Create: `apps/worker/src/database-config.ts`, `apps/worker/src/database-config.test.ts`
- Modify: `apps/worker/src/main.ts`, `apps/worker/src/main-esm-runtime.test.ts`

**Interfaces:**
- Consumes: Task 1 `readDatabaseUrl`
- Produces: `waitForDatabaseUrl(options?: { read?: () => string | undefined; sleep?: (ms: number) => Promise<void>; log?: (line: string) => void; intervalMs?: number }): Promise<string>` (`intervalMs` เริ่มต้น 10000)

- [ ] **Step 1: เขียน test ที่ล้ม** — `read` คืน undefined 2 ครั้งแล้วคืนค่า → resolve ค่านั้น, `sleep` ถูกเรียก 2 ครั้งด้วย 10000, `log` ถูกเรียก 1 ครั้งด้วย `backoffice.worker.waiting_for_database_config`; แก้ `main-esm-runtime.test.ts` ให้คาด log บรรทัดนี้แทน `DATABASE_URL is required` (ฆ่า process หลังเห็น log)
- [ ] **Step 2: รัน `pnpm --filter @backoffice/worker test` — FAIL**
- [ ] **Step 3: implement** และให้ `main.ts` `await waitForDatabaseUrl()` แทน `throw`
- [ ] **Step 4: รันอีกครั้ง — PASS**
- [ ] **Step 5: Commit** `feat(worker): wait for the database configuration instead of exiting`

### Task 9: Infra และเอกสาร

**Files:**
- Modify: `infra/compose/docker-compose.production.yml`, `infra/compose/.env.production.example`, `infra/compose/compose-config.test.sh`, `apps/web/Dockerfile`, `infra/backup/backup.sh`, `infra/backup/README.md`, `docs/runbooks/deploy.md`
- Create: `infra/compose/docker-compose.external-db.yml`

**Interfaces:**
- Consumes: Task 1 env `BACKOFFICE_CONFIG_DIR`, Task 5 env `BACKOFFICE_MIGRATIONS_DIR`

- [ ] **Step 1: เขียน test ที่ล้มใน `compose-config.test.sh`** — production render: web mount `backoffice-config` ที่ `/var/lib/backoffice/config` (ไม่ใช่ `:ro`), worker mount `:ro`, render ผ่านโดยไม่ตั้ง `DATABASE_URL_FILE`; render รวม `docker-compose.external-db.yml`: web และ worker อยู่ network `database` (ไม่ internal) และ `mariadb` ไม่อยู่ในรายการ service ที่เริ่มเมื่อไม่ใส่ `--profile bundled-db`
- [ ] **Step 2: รัน `bash infra/compose/compose-config.test.sh` — FAIL**
- [ ] **Step 3: implement compose**; Dockerfile runtime: `COPY --from=build /app/packages/db/migrations ./packages/db/migrations` และ `ENV BACKOFFICE_MIGRATIONS_DIR=/app/packages/db/migrations`; `backup.sh` เพิ่ม `config.tar` จาก `/var/lib/backoffice/config` ของ web ลงในไฟล์เข้ารหัสเดิม
- [ ] **Step 4: รัน `bash infra/compose/compose-config.test.sh` และ `bash infra/backup/restore-verify.test.sh` — PASS**
- [ ] **Step 5: อัปเดต `deploy.md`** ส่วนใหม่ "First-run setup": ตั้งคีย์ secret อื่นก่อน → `docker compose ... up -d` → `docker compose logs web | grep backoffice.setup.code` → เปิด `/setup` → ฐานภายนอกใช้ `-f docker-compose.external-db.yml` → เปลี่ยนค่าเชื่อมภายหลังให้แก้ไฟล์ใน volume แล้ว restart web+worker; backup README เพิ่ม `config.tar`
- [ ] **Step 6: Commit** `chore(infra): config volume, external database override and setup runbook`

### Task 10: ตรวจสอบทั้ง branch

- [ ] **Step 1:** `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test` — ทุกอย่างผ่าน (รายงานผลจริง)
- [ ] **Step 2:** เปิด MariaDB 11.8 ใน Docker แล้ว `DATABASE_URL=mysql://root:...@<ip>:3306/test pnpm test:integration` — ผ่าน
- [ ] **Step 3:** `docker build -f apps/web/Dockerfile .` แล้วรัน container โดยไม่มี `DATABASE_URL` + มีคีย์ครบ + mount config volume → log มี `backoffice.setup.code`; รัน e2e ด้วย `E2E_BASE_URL` + `E2E_SETUP_CODE`; ถ่ายภาพหน้า `/setup` ที่ 1280 และ 390 ลง `/mnt/project-files/screenshots/2026-10-27/`
- [ ] **Step 4:** `bash infra/backup/restore-verify.test.sh` และ `git diff --check` — ผ่าน
- [ ] **Step 5:** ขอ code review (superpowers:requesting-code-review) แล้วเปิด PR
