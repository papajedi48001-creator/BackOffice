# HR Command Chain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** หาผู้อนุมัติจากโครงสร้างหน่วยงาน (หัวหน้าหน่วยงานแต่ละชั้นจนถึงชนิดหน่วยงานเป้าหมาย) และให้ HR ตั้งชนิดหน่วยงานกับหัวหน้าได้ทั้งจากหน้าจอและ CSV

**Architecture:** ฟังก์ชัน pure `resolveCommandChain` ไล่ `parent_id` บนชุดหน่วยงานที่โหลดไว้; `CommandChainService` โหลดหน่วยงานพร้อมหัวหน้า ณ เวลาหนึ่งด้วย query เดียว; `OrganizationHeadService` เขียนวาระหัวหน้าและชนิดหน่วยงานพร้อม audit ใน transaction เดียว; `DatabaseApproverResolver` ของคำขอกลางใช้ `NEAREST_HEAD` แล้วถอยไปใช้ `manager_person_id` เดิมเมื่อว่าง

**Tech Stack:** TypeScript, zod (`@backoffice/contracts`), vitest, MariaDB (mysql2 ผ่าน `@backoffice/db`), Next.js App Router (`apps/web`)

**Spec:** `docs/superpowers/specs/2026-10-22-hr-command-chain-design.md`

## Global Constraints

- ชนิดหน่วยงานมี 3 ค่า: `SECTION` (งาน), `DIVISION` (กลุ่มงาน), `HOSPITAL` (โรงพยาบาล); คอลัมน์ `organization.unit_type` เป็น NULL ได้
- Migration ชื่อ `0009_hr_command_chain.sql`, additive, `IF NOT EXISTS` ทุกคำสั่ง, ต่อท้ายรายการใน `packages/db/src/migrate.ts`
- ตารางใหม่ `hr_organization_head` (`id`, `organization_id`, `person_id`, `effective_from`, `effective_until`, `created_at`)
- Permission ใหม่ `hr.organization.manage` ผูกกับ `hr-manager`, ตรวจแบบทั้งโรงพยาบาล (`canActHospitalWide(..., 'hr')`) ที่ server
- Audit actions: `hr.organization.head.assign` (metadata `organizationId`, `personId`), `hr.organization.type.update` (metadata `organizationId`, `unitType`)
- ห้ามมีเลขประจำตัวประชาชนใน URL, log, audit metadata
- เก็บเวลา UTC; ค่าเริ่มต้นวันที่มีผลในฟอร์มคือวันนี้ตามเวลา Asia/Bangkok
- ข้อความไทยอยู่ใน `packages/i18n/src/th.ts` ด้วย prefix `hr`; ศัพท์ใหม่อยู่ใน `CONTEXT.md` ก่อนใช้
- Commit แบบ Conventional Commit หนึ่งครั้งต่อ task

## Review Focus

1. หน่วยงานที่ `parent_id` ชี้ไปหน่วยที่ไม่มีอยู่ ต้องหยุดไล่ ไม่โยน error (เทสใน Task 3)
2. หัวหน้าที่วาระเริ่มในอนาคต ต้องไม่ถูกนับเป็นหัวหน้าปัจจุบัน (เทสใน Task 4)
3. ตั้งหัวหน้าซ้ำพร้อมกันสองครั้ง ต้องได้วาระเปิดอยู่แถวเดียว: ล็อกแถวหน่วยงานด้วย `SELECT ... FOR UPDATE` ก่อนปิดวาระ (เทสใน Task 5)
4. ไฟล์ CSV หน่วยงานรูปแบบเดิม (ไม่มีคอลัมน์ใหม่) ต้องนำเข้าแล้วไม่ล้างชนิดหน่วยงานหรือหัวหน้าเดิม (เทสใน Task 7)
5. คำขอกลางของคนในหน่วยที่ยังไม่ตั้งหัวหน้า ต้องยังยื่นได้ด้วยผู้บังคับบัญชาตรงเดิม (เทสใน Task 6)

---

### Task 1: Contracts, permission and domain terms

**Files:**
- Modify: `packages/contracts/src/hr.ts`, `packages/contracts/src/access.ts:3`
- Modify: `packages/core/src/access/policy.ts`
- Modify: `CONTEXT.md` (หมวด องค์กรและผู้ใช้)
- Test: `packages/core/src/access/authorization-service.test.ts`, `packages/contracts/src/hr.test.ts` (create if absent)

**Interfaces:**
- Produces: `organizationUnitTypeSchema`, `type OrganizationUnitType`, `commandChainTargetSchema`, `type CommandChainTarget` (`OrganizationUnitType | 'NEAREST_HEAD'`), `assignOrganizationHeadInputSchema` (`{ organizationId: string; personId: string; effectiveFrom: Date }`, coerce date), `setOrganizationUnitTypeInputSchema` (`{ organizationId: string; unitType: OrganizationUnitType | null }`); permission `'hr.organization.manage'`

- [ ] **Step 1: Write failing tests**
  - `hr.test.ts`: `organizationUnitTypeSchema.parse('DIVISION')` ok; `.safeParse('MISSION').success === false`; `commandChainTargetSchema.parse('NEAREST_HEAD')` ok
  - `authorization-service.test.ts` new `it('lets an hr manager who owns hr data manage organizations hospital-wide')`: subject `{ roles: [{ name: 'hr-manager', organizationId: null }], hospitalWideDataOwnerModules: ['hr'], dataOwnerModules: ['hr'] }` → `canActHospitalWide(subject, 'hr.organization.manage', 'hr') === true`; same with role `hr-reader` → `false`; `requiresDataOwner('hr.organization.manage') === true`
- [ ] **Step 2: Run** `pnpm --filter @backoffice/core test -- authorization-service && pnpm --filter @backoffice/contracts test` → FAIL (unknown permission / missing export)
- [ ] **Step 3: Implement** schemas in `hr.ts`; add permission to enum; `hr-manager` gets `hr.organization.manage`; `requiresDataOwner` returns true for both HR manage permissions; add CONTEXT.md terms **ชนิดหน่วยงาน**, **หัวหน้าหน่วยงาน**, **สายบังคับบัญชา** verbatim from spec
- [ ] **Step 4: Run** same command → PASS; `pnpm typecheck` → PASS
- [ ] **Step 5: Commit** `feat(hr): add unit type, command chain contracts and organization permission`

### Task 2: Migration 0009 and schema

**Files:**
- Create: `packages/db/migrations/0009_hr_command_chain.sql`
- Modify: `packages/db/src/migrate.ts` (list), `packages/db/src/schema/core.ts` (`organizations.unitType`), `packages/db/src/schema/hr.ts` (`organizationHeads`)
- Modify: `infra/backup/restore-verify.sh` (`required_tables` add `hr_organization_head`), `docs/integration/modules.md` (migration table row `0009 | 0009_hr_command_chain.sql | ระบบ HR | กำลังพัฒนา`)
- Test: `packages/db/src/migrate.test.ts`

**Interfaces:**
- Produces: table `hr_organization_head`, column `organization.unit_type`; Drizzle `organizationHeads`

- [ ] **Step 1: Write failing test** in `migrate.test.ts` mirroring the 0007 assertions: recorded set has `'0009_hr_command_chain.sql'`
- [ ] **Step 2: Run** `pnpm --filter @backoffice/db test` → FAIL
- [ ] **Step 3: Implement** SQL exactly as spec "Data" section; add to list; Drizzle columns
- [ ] **Step 4: Run** `pnpm --filter @backoffice/db test && bash infra/backup/restore-verify.test.sh` → PASS
- [ ] **Step 5: Commit** `feat(db): add organization unit type and head history (0009)`

### Task 3: Pure `resolveCommandChain`

**Files:**
- Create: `packages/core/src/hr/command-chain.ts`, `packages/core/src/hr/command-chain.test.ts`
- Modify: `packages/core/src/index.ts` (export)

**Interfaces:**
- Consumes: `CommandChainTarget`, `OrganizationUnitType`, `ApproverSnapshot`
- Produces:
  ```ts
  export interface ChainUnit { id: string; parentId: string | null; unitType: OrganizationUnitType | null; head: { personId: string; active: boolean } | null }
  export interface CommandChain { approvers: ApproverSnapshot[]; skippedOrganizationIds: string[]; reachedTarget: boolean }
  export function resolveCommandChain(input: { units: ReadonlyMap<string, ChainUnit>; organizationId: string; requestorPersonId: string; target: CommandChainTarget }): CommandChain
  ```

Fixture for tests: `S` (SECTION, head `s-head`) → `D` (DIVISION, head `d-head`) → `H` (HOSPITAL, head `director`).

- [ ] **Step 1: Write failing tests** (`describe('resolveCommandChain')`):
  - `walks section to division`: target `DIVISION` from `S` by `nurse` → approvers `[{s-head,S},{d-head,D}]`, `reachedTarget: true`, skipped `[]`
  - `walks to the hospital`: target `HOSPITAL` → three approvers in order
  - `nearest head stops after one approver`: `NEAREST_HEAD` → `[{s-head,S}]`
  - `skips the requester when they head their own unit`: requestor `s-head`, target `DIVISION` → `[{d-head,D}]`, skipped `[]`; with `NEAREST_HEAD` → `[{d-head,D}]`
  - `skips and reports a unit without a head`: `D.head = null`, target `HOSPITAL` → `[{s-head,S},{director,H}]`, skipped `['D']`
  - `treats an inactive head as missing`: `D.head.active = false` → same as above
  - `lists a person heading two levels once`: `D.head = s-head`, target `HOSPITAL` → `[{s-head,S},{director,H}]`
  - `reports a chain that never meets the target`: units without any `HOSPITAL`, target `HOSPITAL` → all heads, `reachedTarget: false`
  - `stops on a parent cycle`: `H.parentId = 'S'` → terminates, no duplicate entries
  - `stops at a missing parent`: `S.parentId = 'gone'` → `[{s-head,S}]`, `reachedTarget: false`
  - `returns an empty chain for an unknown organization`: → `{ approvers: [], skippedOrganizationIds: [], reachedTarget: false }`
- [ ] **Step 2: Run** `pnpm --filter @backoffice/core test -- command-chain` → FAIL (module not found)
- [ ] **Step 3: Implement** per spec "Components › command-chain.ts" algorithm; `visited: Set<string>` guards cycles
- [ ] **Step 4: Run** same → PASS
- [ ] **Step 5: Commit** `feat(hr): resolve command chain from organization heads`

### Task 4: `CommandChainService` (database loader)

**Files:**
- Create: `packages/core/src/hr/command-chain-service.ts`, `packages/core/src/hr/command-chain-service.integration.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `resolveCommandChain`, `ChainUnit`
- Produces: `class CommandChainService { constructor(database: Pick<Database, 'query'>); resolve(input: { requestorPersonId: string; organizationId: string; target: CommandChainTarget; at?: Date }): Promise<CommandChain> }` (`at` defaults to now)

- [ ] **Step 1: Write failing integration test** (pattern of `master-data-import.integration.test.ts`, `describeWithDatabase`): seed three organizations S→D→H with `unit_type`, three people (one `INACTIVE`), heads in `hr_organization_head`:
  - `d-head` วาระ 2026-01-01..2026-06-01, `d-head-2` from 2026-06-01 open → `resolve({... target: 'DIVISION', at: 2026-03-01})` gives `d-head`; `at: 2026-07-01` gives `d-head-2`
  - a head row with `effective_from` in the future relative to `at` is ignored (Review Focus 2)
  - `INACTIVE` head person → that organization in `skippedOrganizationIds`
- [ ] **Step 2: Run** `DATABASE_URL=... pnpm --filter @backoffice/core test:integration -- command-chain-service` → FAIL
- [ ] **Step 3: Implement** one query: `SELECT o.id, o.parent_id AS parentId, o.unit_type AS unitType, h.person_id AS headPersonId, p.employment_status AS headStatus FROM organization o LEFT JOIN hr_organization_head h ON h.organization_id = o.id AND h.effective_from <= ? AND (h.effective_until IS NULL OR h.effective_until > ?) LEFT JOIN person p ON p.id = h.person_id`; map to `ChainUnit` (`active = headStatus === 'ACTIVE'`)
- [ ] **Step 4: Run** same → PASS
- [ ] **Step 5: Commit** `feat(hr): load organization heads to resolve command chains`

### Task 5: `OrganizationHeadService`

**Files:**
- Create: `packages/core/src/hr/organization-head-service.ts`, `organization-head-service.test.ts`, `organization-head-service.integration.test.ts`
- Modify: `packages/core/src/audit/redact.ts` (`allowedKeys` add `personId`, `unitType`), `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `assignOrganizationHeadInputSchema`, `setOrganizationUnitTypeInputSchema`, `AuditService`, `DatabaseAuditRepository`
- Produces:
  ```ts
  export type HeadAssignmentDecision = { kind: 'unchanged' } | { kind: 'assign'; closeCurrentId: string | null } | { kind: 'error'; code: 'EFFECTIVE_FROM_BEFORE_CURRENT' | 'PERSON_NOT_ACTIVE' | 'ORGANIZATION_NOT_FOUND' }
  export function decideHeadAssignment(input: { organizationExists: boolean; personStatus: 'ACTIVE' | 'INACTIVE' | null; current: { id: string; personId: string; effectiveFrom: Date } | null; personId: string; effectiveFrom: Date }): HeadAssignmentDecision
  export class OrganizationHeadService {
    constructor(database: Pick<Database, 'query' | 'transaction'>, createId?: () => string)
    assign(input: AssignOrganizationHeadInput, actorPersonId: string, database?: QueryDatabase): Promise<HeadAssignmentDecision>
    setUnitType(input: SetOrganizationUnitTypeInput, actorPersonId: string): Promise<{ ok: true } | { ok: false; code: 'ORGANIZATION_NOT_FOUND' }>
  }
  ```
  `assign` accepts an optional open transaction so the CSV import (Task 7) reuses it; without one it opens its own.

- [ ] **Step 1: Write failing unit tests** for `decideHeadAssignment`: unknown org → `ORGANIZATION_NOT_FOUND`; `personStatus: null` or `'INACTIVE'` → `PERSON_NOT_ACTIVE`; same person as current → `unchanged`; `effectiveFrom` before `current.effectiveFrom` → `EFFECTIVE_FROM_BEFORE_CURRENT`; new person with current → `assign` with `closeCurrentId: current.id`; no current → `closeCurrentId: null`. Plus `redact.test`: metadata `{ organizationId, personId, unitType, nationalId }` keeps the first three only
- [ ] **Step 2: Write failing integration tests**: assign A then B → A's row `effective_until = B.effective_from`, one open row, two audit rows `hr.organization.head.assign`; two concurrent `assign` calls for different people → exactly one open row afterwards (Review Focus 3); `setUnitType` writes column and `hr.organization.type.update` audit in the same transaction (forced audit failure leaves column unchanged)
- [ ] **Step 3: Run** `pnpm --filter @backoffice/core test -- organization-head` and integration → FAIL
- [ ] **Step 4: Implement**: in transaction, `SELECT id FROM organization WHERE id = ? FOR UPDATE`, read person status and current open head, call `decideHeadAssignment`, then `UPDATE ... SET effective_until = ?` + `INSERT` + audit (`targetType: 'organization'`, `targetId: organizationId`, `result: 'SUCCESS'`)
- [ ] **Step 5: Run** both suites → PASS
- [ ] **Step 6: Commit** `feat(hr): assign organization heads and unit types with audit`

### Task 6: Central requests use the command chain

**Files:**
- Modify: `packages/core/src/workflow/request-service.ts:19` (`ApproverResolver.resolve` input gains `target?: CommandChainTarget`)
- Modify: `apps/web/src/lib/database-approver-resolver.ts`
- Create: `apps/web/src/lib/database-approver-resolver.test.ts`

**Interfaces:**
- Consumes: `CommandChainService`
- Produces: `DatabaseApproverResolver.resolve({ moduleCode, requestorPersonId, organizationId, target? })` → chain approvers for `target ?? 'NEAREST_HEAD'`; if empty, the existing `manager_person_id` query

- [ ] **Step 1: Write failing tests** with a fake `query` that answers the chain SQL and the manager SQL: chain with a head → `[{ personId: 's-head', organizationId: 'S' }]` and manager query not called; no heads anywhere → returns the manager row (Review Focus 5); `target: 'DIVISION'` passes through
- [ ] **Step 2: Run** `pnpm --filter @backoffice/web test -- database-approver-resolver` → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** same plus `pnpm --filter @backoffice/core test -- request-service` → PASS
- [ ] **Step 5: Commit** `feat(workflow): route central requests through the command chain`

### Task 7: CSV import columns

**Files:**
- Modify: `packages/core/src/hr/master-data-validation.ts` (`organizationColumns.optional` add `unit_type`, `head_employee_code`; `OrganizationImportRow` gains `unitType: OrganizationUnitType | null | undefined`, `headEmployeeCode: string | null`; error codes `UNKNOWN_UNIT_TYPE`, `UNKNOWN_HEAD`; `ExistingOrganization` gains `unitType`)
- Modify: `packages/core/src/hr/master-data-import.ts` (`loadExistingMasterData` reads `unit_type`; `write` updates `unit_type` when given; heads via `OrganizationHeadService.assign(..., database)` with `effectiveFrom` = apply time; summary gains `headsChanged`)
- Modify: `apps/web/src/app/(app)/hr/imports/*` and `packages/i18n/src/th.ts` for the two error labels and the summary count
- Test: `master-data-validation.test.ts`, `master-data-import.integration.test.ts`

Unit type cell mapping: `งาน`/`SECTION`, `กลุ่มงาน`/`DIVISION`, `โรงพยาบาล`/`HOSPITAL` (case-insensitive for English); empty → `undefined` (leave unchanged).

- [ ] **Step 1: Write failing validation tests**: `unit_type` `กลุ่มงาน` → `unitType: 'DIVISION'`; `ฝ่าย` → error `UNKNOWN_UNIT_TYPE` at that row/column; `head_employee_code` found in same people file → ok; unknown → `UNKNOWN_HEAD`; old header `code,name,parent_code` → `unitType: undefined`, `headEmployeeCode: null`, no errors
- [ ] **Step 2: Write failing integration test**: apply organizations with `unit_type,head_employee_code` → column set, open head row, `headsChanged: 1`; re-apply same → `headsChanged: 0`; apply old-format file → unit type and head unchanged (Review Focus 4)
- [ ] **Step 3: Run** → FAIL
- [ ] **Step 4: Implement**
- [ ] **Step 5: Run** `pnpm --filter @backoffice/core test && pnpm --filter @backoffice/core test:integration -- master-data` → PASS
- [ ] **Step 6: Commit** `feat(hr): import unit types and heads from the organizations file`

### Task 8: Organization tree shows type and head

**Files:**
- Modify: `packages/core/src/hr/hr-directory.ts` (`DirectoryOrganization` gains `unitType`, `headPersonId`, `headDisplayName`; `listOrganizations` joins the current head)
- Modify: `apps/web/src/app/(app)/hr/organizations/page.tsx`, `page.test.tsx`
- Modify: `packages/i18n/src/th.ts` (`hrUnitTypeSection: 'งาน'`, `hrUnitTypeDivision: 'กลุ่มงาน'`, `hrUnitTypeHospital: 'โรงพยาบาล'`, `hrOrganizationHead: 'หัวหน้า'`, `hrNoHead: 'ยังไม่มีหัวหน้า'`)

- [ ] **Step 1: Write failing page test**: unit with head → renders `กลุ่มงาน` and `หัวหน้า นพ.สมชาย ใจดี`; unit without head → element with text `ยังไม่มีหัวหน้า`; unit name is a link to `/hr/organizations/<id>`
- [ ] **Step 2: Run** `pnpm --filter @backoffice/web test -- hr/organizations` → FAIL
- [ ] **Step 3: Implement** (badge styling per `DESIGN.md` warning tokens)
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `feat(hr): show unit type and head in the organization tree`

### Task 9: Organization detail page and API

**Files:**
- Create: `apps/web/src/app/api/hr/organizations/[organizationId]/unit-type/route.ts` (+ `route.test.ts`), `apps/web/src/app/api/hr/organizations/[organizationId]/heads/route.ts` (+ `route.test.ts`)
- Create: `apps/web/src/app/(app)/hr/organizations/[organizationId]/page.tsx` (+ `page.test.tsx`), client form components beside it
- Modify: `packages/core/src/hr/hr-directory.ts` (`getOrganization(id)` with `headHistory: { personId, displayName, employeeCode, effectiveFrom, effectiveUntil }[]` newest first)
- Modify: `apps/web/src/app/(app)/access/audit/audit-event-table.tsx` (labels `hr.organization.head.assign: 'ตั้งหัวหน้าหน่วยงาน'`, `hr.organization.type.update: 'แก้ชนิดหน่วยงาน'`), `packages/i18n/src/th.ts`

**Interfaces:**
- Consumes: `OrganizationHeadService`, `AuthorizationService.canActHospitalWide(session, 'hr.organization.manage', 'hr')`
- Produces: `PUT unit-type` body `{ unitType: 'SECTION' | 'DIVISION' | 'HOSPITAL' | null }`; `POST heads` body `{ personId: string; effectiveFrom: 'YYYY-MM-DD' }` (Bangkok date → UTC midnight-of-Bangkok)

- [ ] **Step 1: Write failing route tests** (pattern of `api/hr/imports/route.test.ts`): no session → 401; `hr-reader` → 403; bad body → 400 `invalid_input`; service `ORGANIZATION_NOT_FOUND` → 404; `PERSON_NOT_ACTIVE` / `EFFECTIVE_FROM_BEFORE_CURRENT` → 400 with that code; success → 200
- [ ] **Step 2: Write failing page tests**: `hr-manager` sees unit type select and head form; `hr-reader` sees values and head history but no form; unknown id → not-found text
- [ ] **Step 3: Run** `pnpm --filter @backoffice/web test -- hr/organizations` → FAIL
- [ ] **Step 4: Implement**; person picker searches by employee code or name from `HrDirectory.listPeople({ organizationIds: 'all' })` filtered to `ACTIVE`
- [ ] **Step 5: Run** → PASS
- [ ] **Step 6: Commit** `feat(hr): manage unit type and head from the organization page`

### Task 10: Whole-branch verification

- [ ] **Step 1:** `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test` → all PASS
- [ ] **Step 2:** `DATABASE_URL=mysql://backoffice:<password>@127.0.0.1:3306/backoffice pnpm test:integration` → PASS (if no MariaDB is available, report that integration suites were skipped)
- [ ] **Step 3:** `bash infra/backup/restore-verify.test.sh && git diff --check` → PASS
- [ ] **Step 4:** code review (`superpowers:requesting-code-review`), fix findings, open PR to `main`
