# ทะเบียนประวัติบุคลากร Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** One profile page per บุคลากร with personal, contact and work details, self-service contact editing, HR-managed employment types, and an audit-based change history.

**Architecture:** New `hr_person_profile` and `hr_employment_type` tables (migration 0010). A pure access module decides what a viewer may see or edit; `HrProfileService` reads and writes the profile, `person` columns, the open assignment and one audit event per save in one transaction. Next.js server pages render it; route handlers validate with zod and check access on the server.

**Tech Stack:** pnpm monorepo, TypeScript, zod, mysql2 on MariaDB 11.8, Drizzle schema, Next.js App Router, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-25-hr-staff-profile-design.md`

## Global Constraints

- Migration file `packages/db/migrations/0010_hr_staff_profile.sql`, additive only, listed after 0009 in `packages/db/src/migrate.ts`; Drizzle schema in `packages/db/src/schema/hr.ts` kept in step.
- New permission `hr.person.private.read`, granted to `hr-manager` only, and `requiresDataOwner` returns true for it.
- Seed employment types (code → name, sort order 1–6): `CIVIL_SERVANT` ข้าราชการ, `GOVERNMENT_EMPLOYEE` พนักงานราชการ, `MOPH_EMPLOYEE` พนักงานกระทรวงสาธารณสุข (พกส.), `PERMANENT_EMPLOYEE` ลูกจ้างประจำ, `TEMPORARY_EMPLOYEE` ลูกจ้างชั่วคราว, `DAILY_EMPLOYEE` ลูกจ้างรายวัน.
- Prefix → gender: นาย, นพ., ทพ., ภก. → `MALE`; นาง, นางสาว, พญ., ทญ., ภญ. → `FEMALE`. Gender values `MALE` | `FEMALE`.
- Audit actions: `hr.person.profile.update`, `hr.person.contact.update`, `hr.employment_type.create`, `hr.employment_type.update`; target type `person` (or `employment_type`). Metadata keys: `changedFields` (string[]), `workChanges` (`{ [field]: { from: string|null, to: string|null } }`, work fields only). Personal and contact values never enter audit metadata, logs, URLs, notifications or outbox payloads.
- Dates in inputs are `YYYY-MM-DD` and must be real calendar dates; birth date not after today (Bangkok). `birth_date` and `appointed_on` are SQL `DATE`, read with `DATE_FORMAT(..., '%Y-%m-%d')`.
- Phone: `/^[0-9+\- ]{1,32}$/`. Lengths: prefix 32, names 120, address 500, emergency name 255, relationship 64, position level 120, employment type name 120, code `/^[A-Z][A-Z0-9_]{1,31}$/`.
- UI copy is Thai in `packages/i18n/src/th.ts`; new pages are sections of the `hr` entry in `apps/web/src/lib/modules.ts`, no new main-page tile.

## Review Focus

1. A reader with `hr.person.read` but not private access loads `/hr/people/[id]` — the server response object must contain no personal or contact field (not merely hidden in markup). Pinned in Task 5 and Task 9.
2. A signed-in person without any HR role calls `PUT /api/hr/me/contact` with a `personId` in the body for someone else — the body id is ignored; only the session person changes. Pinned in Task 8.
3. HR saves a profile with no actual change — no audit event, no `updated_at` churn. Pinned in Task 6.
4. A deactivated employment type is chosen on save or in CSV — rejected with `INACTIVE_EMPLOYMENT_TYPE`, while people already on it keep it and still display its name. Pinned in Task 6 and Task 7.
5. Prefix `ดร.` with no gender given — rejected with `GENDER_REQUIRED`; prefix `นาง` with gender `MALE` given — accepted as `MALE` (override). Pinned in Task 1 and Task 6.

---

### Task 1: Contracts — inputs, prefix gender, permission

**Files:**
- Modify: `packages/contracts/src/hr.ts`, `packages/contracts/src/access.ts`, `packages/core/src/access/policy.ts`
- Test: `packages/contracts/src/hr.test.ts`, `packages/core/src/access/authorization-service.test.ts`

**Interfaces:**
- Produces:
  - `genderSchema = z.enum(['MALE','FEMALE'])`, `type Gender`
  - `genderForPrefix(prefix: string | null): Gender | null`
  - `calendarDateSchema` (string `YYYY-MM-DD`, rejects 2026-02-30)
  - `updatePersonProfileInputSchema`: `{ namePrefix, firstName, lastName, gender, birthDate, employmentTypeId, appointedOn, positionTitle, positionLevel, organizationId }`, every field optional and nullable except `organizationId` optional non-null; refinement sets issue `GENDER_REQUIRED` when `namePrefix` is given, `genderForPrefix` is null and `gender` is absent
  - `updatePersonContactInputSchema`: `{ phone, address, emergencyContactName, emergencyContactRelationship, emergencyContactPhone }`, nullable strings
  - `employmentTypeInputSchema`: `{ code, name, isActive, sortOrder }`; `type EmploymentType = { id, code, name, isActive, sortOrder }`
  - `type PersonProfileField` union of the field names above
  - permission `'hr.person.private.read'`

- [x] **Step 1: Write failing tests** in `hr.test.ts`: `genderForPrefix('นพ.') === 'MALE'`, `genderForPrefix('นางสาว') === 'FEMALE'`, `genderForPrefix('ดร.') === null`; `calendarDateSchema.safeParse('2026-02-30').success === false`, `'2026-02-28'` ok; profile schema with `{ namePrefix: 'ดร.' }` fails with message `GENDER_REQUIRED`, with `{ namePrefix: 'นาง', gender: 'MALE' }` succeeds; contact schema rejects phone `'08x'`. In `authorization-service.test.ts`: `hr-manager` with data ownership is allowed `hr.person.private.read`; `hr-reader` is denied.
- [x] **Step 2: Run** `pnpm --filter @backoffice/contracts test && pnpm --filter @backoffice/core test -- authorization` — Expected: FAIL (exports missing).
- [x] **Step 3: Implement** the exports; add the permission to `permissionSchema`, `hr-manager` and `requiresDataOwner`.
- [x] **Step 4: Run** the same commands — Expected: PASS.
- [x] **Step 5: Commit** `feat(hr): add staff profile contracts and private-read permission`

### Task 2: Migration 0010, schema, redact allowlist

**Files:**
- Create: `packages/db/migrations/0010_hr_staff_profile.sql`
- Modify: `packages/db/src/migrate.ts`, `packages/db/src/migrate.test.ts`, `packages/db/src/schema/hr.ts`, `infra/backup/restore-verify.sh`, `docs/integration/modules.md`, `packages/core/src/audit/redact.ts`
- Test: `packages/db/src/migrate.test.ts`, `packages/core/src/audit/audit-service.test.ts`

**Interfaces:**
- Produces: tables `hr_employment_type`, `hr_person_profile` exactly as in the spec; Drizzle `employmentTypes`, `personProfiles`; `workChanges` allowed in audit metadata.

- [x] **Step 1: Write failing tests**: migrate test expects 10 migrations with `0010_hr_staff_profile.sql` last; audit test expects `workChanges` to survive `redactAuditMetadata` while an unknown key `phone` is dropped.
- [x] **Step 2: Run** `pnpm --filter @backoffice/db test && pnpm --filter @backoffice/core test -- audit` — Expected: FAIL.
- [x] **Step 3: Implement** the SQL (seed rows with fixed UUIDs `00000000-0000-4000-8000-00000000000N`, `INSERT IGNORE`, `UTC_TIMESTAMP()`), list it, add Drizzle tables, add both tables to `required_tables`, add the modules.md row `| 0010 | 0010_hr_staff_profile.sql | ระบบ HR | กำลังพัฒนา |`, add `workChanges` to `allowedKeys`.
- [x] **Step 4: Run** the tests plus `DATABASE_URL=… pnpm --filter @backoffice/db migrate` twice (idempotent) and `bash infra/backup/restore-verify.test.sh` — Expected: PASS.
- [x] **Step 5: Commit** `feat(db): add staff profile and employment type tables`

### Task 3: Profile access decisions (pure)

**Files:**
- Create: `packages/core/src/hr/profile-access.ts`
- Test: `packages/core/src/hr/profile-access.test.ts`

**Interfaces:**
- Consumes: `AuthorizationService.organizationScope`, `AccessSubject`.
- Produces: `profileAccess(subject: AccessSubject, target: { personId: string; organizationId: string | null }): { viewWork: boolean; viewPrivate: boolean; editProfile: boolean; editContact: boolean }`. Scope `'all'` or containing `organizationId` grants; self grants `viewWork`, `viewPrivate`, `editContact`. `viewPrivate` and `editProfile` also need `'hr'` in `dataOwnerModules` (or hospital-wide data owner), matching `canAccess`.
  `canManageEmploymentTypes(subject)` = `canActHospitalWide(subject, 'hr.person.manage', 'hr')`.

- [x] **Step 1: Write failing tests** covering: self without roles → `{true,true,false,true}`; scoped hr-reader in same unit → `viewWork` only; hr-reader other unit → all false; hr-manager with data owner → all true; hr-manager without data owner → `viewWork` only; person with no organization and hospital-wide reader → `viewWork`.
- [x] **Step 2: Run** `pnpm --filter @backoffice/core test -- profile-access` — FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** — PASS.
- [x] **Step 5: Commit** `feat(hr): decide who may see and edit a staff profile`

### Task 4: Employment type service

**Files:**
- Create: `packages/core/src/hr/employment-type-service.ts`, `packages/core/src/hr/employment-type-service.integration.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces: `class EmploymentTypeService(database, createId?)` with `list(options?: { activeOnly?: boolean }): Promise<EmploymentType[]>` ordered by `sort_order, name`; `create(input, actorPersonId): Promise<{ ok: true; id: string } | { ok: false; code: 'DUPLICATE_CODE' | 'DUPLICATE_NAME' }>`; `update(id, input, actorPersonId): Promise<{ ok: true } | { ok: false; code: 'NOT_FOUND' | 'DUPLICATE_CODE' | 'DUPLICATE_NAME' }>`. Each write audits in the same transaction; an update that changes nothing writes no audit.

- [x] **Step 1: Write failing integration tests**: list returns the six seeds in order; create then duplicate name → `DUPLICATE_NAME`; rename keeps id and writes `hr.employment_type.update` with `changedFields: ['name']`; deactivated type absent from `list({ activeOnly: true })`.
- [x] **Step 2: Run** `DATABASE_URL=… pnpm --filter @backoffice/core test:integration -- employment-type` — FAIL.
- [x] **Step 3: Implement** (map MariaDB `ER_DUP_ENTRY` on the two unique keys to the codes).
- [x] **Step 4: Run** — PASS.
- [x] **Step 5: Commit** `feat(hr): manage employment types`

### Task 5: Read a profile

**Files:**
- Create: `packages/core/src/hr/profile-service.ts`, `packages/core/src/hr/profile-service.integration.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `profileAccess` (Task 3).
- Produces:
  - `interface ProfileWork { personId; employeeCode; displayName; employmentStatus; organizationId; organizationName; positionTitle; positionLevel; employmentTypeId; employmentTypeName; appointedOn: string | null }`
  - `interface ProfilePrivate { namePrefix; firstName; lastName; gender: Gender | null; birthDate: string | null; phone; address; emergencyContactName; emergencyContactRelationship; emergencyContactPhone }`
  - `interface ProfileChange { at: string; actorDisplayName: string | null; action: string; changedFields: string[]; workChanges: Record<string, { from: string | null; to: string | null }> }`
  - `interface ProfileView { work: ProfileWork; private: ProfilePrivate | null; access: ReturnType<typeof profileAccess>; history: ProfileChange[] }`
  - `class HrProfileService(database, createId?)` with `get(personId: string, viewer: AccessSubject): Promise<ProfileView | 'NOT_FOUND' | 'FORBIDDEN'>`; `getEmployment(personId): Promise<{ employmentTypeCode: string | null; appointedOn: string | null } | null>`.
  - History: audit events with `target_type = 'person'`, `target_id = personId`, action in the three person/contact actions, newest first, at most 50; timestamps via `DATE_FORMAT(... '%Y-%m-%dT%H:%i:%sZ')`.

- [x] **Step 1: Write failing integration tests**: hr-reader result has `private === null` and `Object.keys(result)` has no private key anywhere in `work`; self gets `private`; reader of another unit gets `'FORBIDDEN'`; unknown id `'NOT_FOUND'`; person without a profile row returns nulls; `getEmployment` returns the type code; history newest first.
- [x] **Step 2: Run** — FAIL.
- [x] **Step 3: Implement** — one query for work (person, open assignment, organization, profile, type), a separate query for private columns only when `viewPrivate`.
- [x] **Step 4: Run** — PASS.
- [x] **Step 5: Commit** `feat(hr): read a staff profile by viewer access`

### Task 6: Update profile and contact

**Files:**
- Create: `packages/core/src/hr/profile-changes.ts`, `packages/core/src/hr/profile-changes.test.ts`
- Modify: `packages/core/src/hr/profile-service.ts`, `packages/core/src/hr/profile-service.integration.test.ts`

**Interfaces:**
- Produces:
  - `diffProfile(before: Record<string, string | null>, after: Partial<Record<string, string | null>>, workFields: readonly string[]): { changedFields: string[]; workChanges: Record<string, { from; to }> }` — fields absent from `after` are untouched.
  - `resolveGender(prefix: string | null, given: Gender | null | undefined, stored: Gender | null): Gender | null | 'GENDER_REQUIRED'`.
  - `HrProfileService.updateProfile(personId, input: UpdatePersonProfileInput, actor: AccessSubject): Promise<{ ok: true } | { ok: false; code: 'NOT_FOUND' | 'FORBIDDEN' | 'GENDER_REQUIRED' | 'UNKNOWN_EMPLOYMENT_TYPE' | 'INACTIVE_EMPLOYMENT_TYPE' | 'UNKNOWN_ORGANIZATION' }>`
  - `HrProfileService.updateContact(personId, input: UpdatePersonContactInput, actor: AccessSubject)` with codes `'NOT_FOUND' | 'FORBIDDEN'`.
  - Work fields for `workChanges`: `employmentType` (names, not ids), `appointedOn`, `positionTitle`, `positionLevel`, `organization` (names).
  - Writes: `SELECT … FROM person WHERE id = ? FOR UPDATE` first; upsert `hr_person_profile`; `person.display_name` = `<prefix><first> <last>` when any name part is in the input; `person.position_title`; organization change closes the open `employment_assignment` and opens one at the current UTC time keeping `manager_person_id`; audit last. READ COMMITTED.

- [x] **Step 1: Write failing unit tests** for `diffProfile` (no change → empty; work field → from/to; private field → name only) and `resolveGender` (all five Review Focus combinations).
- [x] **Step 2: Write failing integration tests**: profile save writes profile + display name + audit together; a forced failure after the profile write (invalid organization FK) rolls everything back; no-op save writes no audit; inactive type → `INACTIVE_EMPLOYMENT_TYPE` while an existing holder still reads the name; organization change produces one open assignment; self `updateContact` works, self `updateProfile` → `FORBIDDEN`; audit metadata JSON never contains the phone or address values.
- [x] **Step 3: Run** unit then integration — FAIL.
- [x] **Step 4: Implement.**
- [x] **Step 5: Run** — PASS, also with `TZ=Asia/Bangkok`.
- [x] **Step 6: Commit** `feat(hr): edit staff profile and contact details with audit`

### Task 7: Master data import columns

**Files:**
- Modify: `packages/core/src/hr/master-data-validation.ts`, `packages/core/src/hr/master-data-import.ts`, `apps/web/src/app/(app)/hr/imports/master-data-import-form.tsx`, `packages/i18n/src/th.ts`
- Test: `packages/core/src/hr/master-data-validation.test.ts`, `packages/core/src/hr/master-data-import.integration.test.ts`

**Interfaces:**
- Consumes: `genderForPrefix`, `calendarDateSchema`, `EmploymentTypeService.list`.
- Produces: optional people columns `name_prefix, first_name, last_name, gender, birth_date, employment_type, appointed_on, position_level`; `gender` cell accepts `ชาย`/`หญิง`/`MALE`/`FEMALE`; `employment_type` matches code or name; new error codes `UNKNOWN_EMPLOYMENT_TYPE`, `INACTIVE_EMPLOYMENT_TYPE`, `INVALID_GENDER`, `GENDER_REQUIRED` (plus existing `INVALID_DATE`). `validateMasterData` gains a parameter `employmentTypes: EmploymentType[]` (default `[]`). An empty cell keeps the stored value. Summary gains `profilesChanged`. Import writes are audited with one `hr.person.profile.update` per changed person, inside the import transaction.

- [x] **Step 1: Write failing validation tests** for each new code and for a valid row; error objects contain no cell values.
- [x] **Step 2: Write failing integration test**: importing a person with the new columns stores the profile and `profilesChanged === 1`; re-import of the same file → 0.
- [x] **Step 3: Run** — FAIL.
- [x] **Step 4: Implement**; add Thai labels for the codes and the summary line in the form.
- [x] **Step 5: Run** — PASS.
- [x] **Step 6: Commit** `feat(hr): import staff profile columns from CSV`

### Task 8: API routes

**Files:**
- Create: `apps/web/src/app/api/hr/people/[personId]/profile/route.ts`, `…/contact/route.ts`, `apps/web/src/app/api/hr/me/contact/route.ts`, `apps/web/src/app/api/hr/employment-types/route.ts`, `apps/web/src/app/api/hr/employment-types/[employmentTypeId]/route.ts`, `apps/web/src/app/api/hr/profile-route.ts` (shared `readJson`, `withSessionAndDatabase`, error mapping), and a `route.test.ts` beside each route.

**Interfaces:**
- Consumes: Task 4–6 services.
- Produces: `PUT` profile/contact, `POST`/`PUT` employment types. Status mapping: 401 no session, 503 no database, 400 zod failure (`{ error: 'invalid_input', fields: string[] }` — field names only) or validation code, 403 `FORBIDDEN`, 404 `NOT_FOUND`, 409 `DUPLICATE_CODE`/`DUPLICATE_NAME`, 200 `{ ok: true }`.

- [x] **Step 1: Write failing route tests** following `heads/route.test.ts` (mock session, database, services): each status above; `PUT /api/hr/me/contact` with body `{ personId: 'other', phone: '0812345678' }` calls `updateContact` with the session person id; employment type routes reject an hr-reader with 403.
- [x] **Step 2: Run** `pnpm --filter @backoffice/web test -- api/hr` — FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** — PASS.
- [x] **Step 5: Commit** `feat(hr): add staff profile and employment type endpoints`

### Task 9: Profile pages, people list, menu

**Files:**
- Create: `apps/web/src/app/(app)/hr/people/[personId]/page.tsx`, `apps/web/src/app/(app)/hr/people/[personId]/profile-forms.tsx`, `apps/web/src/app/(app)/hr/me/page.tsx`, `apps/web/src/components/hr-profile-view.tsx` (shared server view), tests beside each
- Modify: `apps/web/src/app/(app)/hr/people/page.tsx`, `packages/core/src/hr/hr-directory.ts` (`employmentTypeName` on `DirectoryPerson`), `apps/web/src/lib/modules.ts`, `apps/web/src/lib/modules.test.ts`, `apps/web/src/styles.css`, `packages/i18n/src/th.ts`, `CONTEXT.md`

**Interfaces:**
- Consumes: `HrProfileService.get`, `EmploymentTypeService.list({ activeOnly: true })`, `HrDirectory.listOrganizations`.
- Produces: sections `{ href: '/hr/me', labelKey: 'hrMyProfile', visible: everyone }` first, then the existing ones, then `{ href: '/hr/employment-types', labelKey: 'hrEmploymentTypes', visible: canActHospitalWide(..., 'hr.person.manage', 'hr') }`. Boxes: ข้อมูลงาน, ข้อมูลส่วนตัว, ข้อมูลติดต่อ, ประวัติการเปลี่ยนแปลง. Dates shown in Thai Buddhist-era format; history times in Asia/Bangkok. The prefix input fills gender on change when `genderForPrefix` knows it.

- [x] **Step 1: Write failing page tests**: reader sees work box only and no form; manager sees all boxes and the two edit forms; `/hr/me` for a person with no HR role renders own private boxes and only the contact form; unknown id shows not-found message; people list shows employment type and links names to `/hr/people/<id>`; modules test: a subject with no roles sees the `hr` entry with exactly the `/hr/me` section.
- [x] **Step 2: Run** `pnpm --filter @backoffice/web test -- hr` — FAIL.
- [x] **Step 3: Implement**; add CONTEXT.md terms ข้อมูลส่วนตัว, ข้อมูลติดต่อ, ประเภทการจ้าง, วันบรรจุ, ระดับตำแหน่ง.
- [x] **Step 4: Run** — PASS.
- [x] **Step 5: Commit** `feat(hr): add staff profile pages`

### Task 10: Employment type page

**Files:**
- Create: `apps/web/src/app/(app)/hr/employment-types/page.tsx`, `employment-type-forms.tsx`, tests beside them
- Modify: `packages/i18n/src/th.ts`

**Interfaces:**
- Consumes: `EmploymentTypeService.list()`, Task 8 endpoints.

- [x] **Step 1: Write failing tests**: non-manager gets the no-access message; manager sees six rows with active state and an add form; the rename form shows the Thai 409 message.
- [x] **Step 2: Run** — FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** — PASS.
- [x] **Step 5: Commit** `feat(hr): add employment type management page`

### Task 11: Verify and finish

- [x] **Step 1:** On a fresh database run `pnpm lint && pnpm typecheck && pnpm test`, `DATABASE_URL=… pnpm test:integration`, `TZ=Asia/Bangkok DATABASE_URL=… pnpm --filter @backoffice/core test:integration`, `pnpm --filter @backoffice/db migrate`, `pnpm --filter @backoffice/web build`, `bash infra/backup/restore-verify.test.sh`, `git diff --check` — all pass.
- [x] **Step 2:** Seed demo data, sign in as an HR manager and as a plain staff member, and capture desktop and mobile screenshots of `/hr/people/[id]` and `/hr/me` into `/mnt/project-files/screenshots/2026-10-25/`.
- [x] **Step 3:** Whole-branch review (`superpowers:requesting-code-review`), fix findings, re-run Step 1.
- [x] **Step 4:** Open the PR to `main`, subscribe, merge when CI is green (standing approval).
