# ระบบอุบัติเหตุหมู่ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `mass-casualty` module: open/close a เหตุอุบัติเหตุหมู่, staff check-in at `/mci`, zone assignment by สายวิชาชีพ rules, casualty registration by tag, and the public กระดานสาธารณะ at `/mci/board`.

**Architecture:** Same layering as fleet: zod contracts in `packages/contracts/src/mass-casualty.ts`, an additive migration plus Drizzle schema, pure rules + services + queries in `packages/core/src/mass-casualty/`, thin Next.js route handlers under `apps/web/src/app/api/mci/**`, server-component pages under `apps/web/src/app/(app)/mci/**`, and two public pages outside the `(app)` group (`app/mci/page.tsx`, `app/mci/board/page.tsx`). Notices go through the outbox: `notification.in_app` per recipient and one new `mci.line.broadcast` event consumed by the worker.

**Tech Stack:** TypeScript, Next.js App Router, React, zod, MariaDB (mysql2 via `@backoffice/db`), Drizzle schema, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-10-mass-casualty-design.md`

## Global Constraints

- Module code `mass-casualty`, href `/mci`, accent `#B91C1C`, group `services`, icon `heart`.
- Permission `mci.command` → `permissionModules['mci.command'] = 'mass-casualty'`; manager role `mci-manager`; tester role `mass-casualty-tester`.
- Command roles `COMMANDER | ZONE_LEAD | RECORDER | STAFF`; Thai labels ผู้บัญชาการเหตุ, หัวหน้าจุด, ผู้บันทึก, เจ้าหน้าที่.
- Incident kind `REAL | DRILL` (เหตุจริง / ซ้อมแผน); status `OPEN | CLOSED`; at most one OPEN.
- Tag format `MCI-` + 3-digit zero-padded sequence per incident (`MCI-001`, `MCI-1000` past 999).
- Seeds: zones จุดคัดกรอง, ER, OPD, IPD; triage แดง `#DC2626` วิกฤต ต้องรักษาทันที, เหลือง `#CA8A04` เร่งด่วน รอได้ระยะสั้น, เขียว `#16A34A` ไม่เร่งด่วน เดินได้, ดำ `#111827` เสียชีวิต (is_deceased), ขาว `#9CA3AF` ไม่บาดเจ็บ/มาตรวจ; statuses รับเข้า/คัดกรอง, กำลังรักษา, รับไว้นอนโรงพยาบาล, ส่งต่อโรงพยาบาลอื่น (needs_destination), กลับบ้านได้, เสียชีวิต (is_deceased); professions แพทย์, พยาบาล, เวรเปล, ผู้ช่วยเหลือคนไข้, เภสัชกร, เจ้าหน้าที่ห้องปฏิบัติการ/รังสี, งานสนับสนุน (ธุรการ/รปภ./คนขับ).
- Public board: refresh 30 s, `Cache-Control: no-store`; list shows only named casualties as `ชื่อ + อักษรแรกนามสกุล + "."`; deceased or `public_hidden` → `กรุณาติดต่อจุดประชาสัมพันธ์`; never tag, colour, HN, age, gender, full surname.
- Every popup is `FormDialog`/`ActionDialog` (closes from its buttons only). Thai UI copy. UTC in DB, Asia/Bangkok on screen.
- Writes + audit + outbox in one transaction; audit metadata never holds casualty names or HN; outbox payloads hold ids only.
- Migration `0032_mass_casualty.sql`, additive, every statement idempotent (`IF NOT EXISTS` / `INSERT IGNORE`), no `;` inside string literals (the runner splits on `;`).

## Review Focus

1. Two recorders saving a casualty at the same moment → distinct consecutive tags (integration test in Task 6).
2. Opening a เหตุ while another opens concurrently → exactly one succeeds, the other gets `INCIDENT_ALREADY_OPEN` (Task 5).
3. A ZONE_LEAD trying to edit a casualty or move a responder in another zone → 403 `FORBIDDEN` (Tasks 3 and 6).
4. Public board for a casualty named but deceased, or later hidden → shows the contact text, never the zone (Task 7 unit test).
5. Sign-in redirect `next` param pointing off-site (`//evil.com`, `https://…`) → ignored, goes to `/dashboard` (Task 10).

---

### Task 1: Contracts, permission and roles

**Files:**
- Create: `packages/contracts/src/mass-casualty.ts`, `packages/contracts/src/mass-casualty.test.ts`
- Modify: `packages/contracts/src/index.ts`, `packages/contracts/src/access.ts`, `packages/contracts/src/admin.ts`, `packages/contracts/src/line.ts`, `packages/core/src/access/policy.ts`, `packages/core/src/access/module-manager-scope.ts`, `packages/core/src/access/authorization-service.test.ts`

**Interfaces (Produces):**
- `MCI_MODULE = 'mass-casualty'`
- `mciCommandRoleSchema = z.enum(['COMMANDER','ZONE_LEAD','RECORDER','STAFF'])`, `type MciCommandRole`
- `mciIncidentKindSchema = z.enum(['REAL','DRILL'])`
- `mciOpenIncidentInputSchema = { title: 1–200, kind, location: 0–300 (default ''), occurredAt: ISO datetime, notify: { mode: 'ALL'|'PROFESSIONS'|'NONE', professionIds: uuid[] max 50 } }` strict
- `mciCheckInInputSchema = { professionId: uuid }` strict
- `mciResponderUpdateInputSchema = { zoneId: uuid|null, commandRole }` strict
- `mciPatientInputSchema = { triageLevelId: uuid, statusId: uuid, zoneId: uuid, destinationHospital: 0–200, firstName: 0–120, lastName: 0–120, gender: 'MALE'|'FEMALE'|'UNKNOWN', ageEstimate: int 0–130 | null, hn: 0–20, publicHidden: boolean }` strict; `mciNewPatientInputSchema` = pick `triageLevelId, zoneId` + the optional name fields.
- Settings inputs: `mciZoneInputSchema {name 1–60, sortOrder int, isActive bool}`, `mciTriageLevelInputSchema {name 1–40, description 0–120, colorHex /^#[0-9A-Fa-f]{6}$/, sortOrder, isActive}`, `mciStatusInputSchema {name 1–60, sortOrder, isActive}`, `mciProfessionInputSchema {name 1–80, sortOrder, isActive, positionIds uuid[] max 200}`, `mciRulesInputSchema {rules: {professionId, zoneId|null}[] max 100}`, `mciContactInputSchema {publicContactPhone 0–40}`.
- `mciLineBroadcastPayloadSchema = { incidentId: uuid, event: 'OPENED'|'CLOSED' }`.
- Permission `mci.command`; `grantableRoleSchema` gains `mci-manager`; `testerModuleCodes` gains `mass-casualty`; `lineAlertModuleCodes` gains `mass-casualty`; policy `'mci-manager': ['mci.command']`; `moduleManagerRoles['mass-casualty'] = 'mci-manager'`.

- [x] **Step 1: Write failing tests** — `mass-casualty.test.ts`: open input rejects empty title and unknown keys; patient input rejects `ageEstimate: 131` and colour `#12345`; broadcast payload rejects non-uuid. `authorization-service.test.ts`: `mci-manager` (unscoped) gets `organizationScope(…, 'mci.command') === 'all'`; plain staff gets `[]`.
- [x] **Step 2: Run** `pnpm --filter @backoffice/contracts test && pnpm --filter @backoffice/core test -- authorization` → FAIL (module missing).
- [x] **Step 3: Implement** the schemas and the map/role entries above.
- [x] **Step 4: Run** the same commands → PASS; also `pnpm typecheck` (exhaustive Records such as `admin-labels.ts` will now demand entries — add `adminRoleMciManager`, `moduleMassCasualty` keys in Task 9; until then add them here so typecheck passes).
- [x] **Step 5: Commit** `feat(mci): add mass-casualty contracts, mci.command and mci-manager`

### Task 2: Migration and Drizzle schema

**Files:**
- Create: `packages/db/migrations/0032_mass_casualty.sql`, `packages/db/src/schema/mass-casualty.ts`, `packages/db/src/schema/mass-casualty-schema.integration.test.ts`
- Modify: `packages/db/src/migrate.ts` (append `'0032_mass_casualty.sql'`), `packages/db/src/migrate.test.ts` (last version now 0032), `packages/db/src/index.ts`

Tables exactly as the spec's "ข้อมูล" section, plus: `mci_patient.public_hidden TINYINT(1) NOT NULL DEFAULT 0`; `mci_incident_lock (id TINYINT PRIMARY KEY)` seeded with row `1` (serialises open); unique `mci_responder_active (incident_id, person_id, active_key)` where `active_key` is a generated column `IF(checked_out_at IS NULL, 1, NULL)`; unique `mci_patient_tag (incident_id, tag_no)`; seeds with fixed uuids `00000000-0000-4000-a000-0000000000NN` via `INSERT IGNORE`. Settings columns `is_active`, `sort_order`, `created_at`, `updated_at`.

- [x] **Step 1: Write failing test** — integration: after `runMigrations`, 5 triage rows with exactly one `is_deceased = 1`, 6 statuses, 4 zones, 7 professions, and a second open responder row for the same person/incident fails with `ER_DUP_ENTRY`.
- [x] **Step 2: Run** `DATABASE_URL=… pnpm --filter @backoffice/db test:integration -- mass-casualty` → FAIL.
- [x] **Step 3: Implement** the SQL, schema file and version list.
- [x] **Step 4: Run** the integration test and `pnpm --filter @backoffice/db test` → PASS.
- [x] **Step 5: Commit** `feat(db): add mass casualty tables (0032)`

### Task 3: Pure rules and in-incident access

**Files:**
- Create: `packages/core/src/mass-casualty/mci-rules.ts`, `mci-rules.test.ts`, `mci-access.ts`, `mci-access.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces (Produces):**
- `formatTag(n: number): string`
- `publicName(firstName: string, lastName: string): string | null` — null when first name blank; `'สมชาย ใ.'`; no surname → first name only.
- `reconcileDeceased(input: { triageLevelId; statusId }, previous: { triageLevelId; statusId } | null, ids: { deceasedTriageId; deceasedStatusId }): { ok: true; triageLevelId; statusId } | { ok: false; code: 'TRIAGE_REQUIRED' }` — choosing the black level sets the deceased status, choosing the deceased status sets black; leaving deceased status while still black → `TRIAGE_REQUIRED`.
- `defaultZoneFor(professionId: string, rules: ReadonlyArray<{ professionId; zoneId: string | null }>, activeZoneIds: ReadonlySet<string>): string | null`
- `canCommandMci(subject: AccessSubject): boolean` (via `AuthorizationService.organizationScope(subject,'mci.command') === 'all'`)
- `type MciActor = { personId: string; commandRole: MciCommandRole; zoneId: string | null } | null` (null = not checked in)
- `mciCan(actor: MciActor, commands: boolean, action: 'record' | 'editPatient' | 'manageResponder' | 'assignRole' | 'viewPatients', targetZoneId?: string | null): boolean` — table from the spec; `commands === true` acts as COMMANDER even when not checked in.

- [x] **Step 1: Write failing tests** covering every row of the spec's permission table (including ZONE_LEAD on another zone → false, STAFF record → false, RECORDER editPatient any zone → true), `formatTag(7) === 'MCI-007'`, `formatTag(1000) === 'MCI-1000'`, `publicName('สมชาย','ใจดี') === 'สมชาย ใ.'`, `publicName('  ','x') === null`, deceased reconciliation in both directions, and `defaultZoneFor` returning null for an inactive zone.
- [x] **Step 2: Run** `pnpm --filter @backoffice/core test -- mci-` → FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** → PASS.
- [x] **Step 5: Commit** `feat(mci): add tag, public name, deceased and access rules`

### Task 4: Settings service and queries

**Files:**
- Create: `packages/core/src/mass-casualty/mci-settings-service.ts`, `mci-settings-service.integration.test.ts`, `mci-settings-queries.ts`

**Interfaces (Produces):**
- `class MciSettingsService(database, createId?)` with `saveZone(actor, id|null, input)`, `saveTriageLevel(actor, id|null, input)`, `saveStatus(actor, id|null, input)`, `saveProfession(actor, id|null, input)`, `saveRules(actor, input)`, `saveContact(actor, input)`; each returns `{ ok: true; id? } | { ok: false; code: 'NOT_FOUND' | 'DUPLICATE_NAME' | 'PROTECTED' }`. `PROTECTED`: deactivating the deceased triage level or status, or the first status. Audit actions `mci.settings.<kind>.save`.
- `class MciSettingsQueries(database)` → `settings(): Promise<MciSettings>` where `MciSettings = { zones; triageLevels; statuses; professions: (… & { positionIds: string[] })[]; rules; publicContactPhone: string; deceasedTriageId; deceasedStatusId; intakeStatusId }` (ordered by sort_order).

- [x] **Step 1: Write failing integration test**: rename ER, add zone, duplicate name → `DUPLICATE_NAME`, deactivate black → `PROTECTED`, rules round-trip, audit row written per save.
- [x] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [x] **Step 5: Commit** `feat(mci): add settings service`

### Task 5: Incident service (open/close + notices)

**Files:**
- Create: `packages/core/src/mass-casualty/mci-incident-service.ts`, `mci-incident-service.integration.test.ts`

**Interfaces (Produces):**
- `class MciIncidentService(database, createId?)`
  - `open(actorPersonId, input: MciOpenIncidentInput): Promise<{ ok: true; incidentId } | { ok: false; code: 'INCIDENT_ALREADY_OPEN' }>` — `SELECT … FROM mci_incident_lock WHERE id = 1 FOR UPDATE`, check no OPEN row, insert, audit `mci.incident.open` `{ kind }`, outbox `notification.in_app` for each recipient (ACTIVE people with an account; filtered by profession via `mci_profession_position` ↔ `hr_person_profile.position_id` when mode PROFESSIONS; none when NONE), subject `ประกาศเหตุอุบัติเหตุหมู่ — กรุณารายงานตัว` prefixed `[ซ้อมแผน] ` for DRILL, `targetPath: '/mci'`, `moduleCode: 'mass-casualty'`, key `notification.in_app:mci-open:<incidentId>:<personId>`; plus one `mci.line.broadcast` `{ incidentId, event: 'OPENED' }` unless NONE.
  - `close(actorPersonId, incidentId): Promise<{ ok: true } | { ok: false; code: 'NOT_FOUND' | 'INCIDENT_CLOSED' }>` — sets CLOSED, checks out open responders at the same timestamp with `checked_out_by = actor`, audit `mci.incident.close`, in-app notice `ปิดเหตุอุบัติเหตุหมู่แล้ว` to every person who checked in, one `mci.line.broadcast` `CLOSED`.

- [x] **Step 1: Write failing integration tests**: open twice → second `INCIDENT_ALREADY_OPEN`; two concurrent opens → one ok; PROFESSIONS notifies only matching positions; close checks out responders and writes outbox; payloads contain no title.
- [x] **Step 2–4:** run FAIL → implement → PASS.
- [x] **Step 5: Commit** `feat(mci): open and close incidents with notices`

### Task 6: Responder and casualty services

**Files:**
- Create: `packages/core/src/mass-casualty/mci-responder-service.ts`, `mci-patient-service.ts`, `mci-responder-service.integration.test.ts`, `mci-patient-service.integration.test.ts`, `packages/core/src/mass-casualty/mci-actor.ts`

**Interfaces (Produces):**
- `loadActor(database, incidentId, personId): Promise<MciActor>`
- `class MciResponderService(database, createId?)`
  - `checkIn(subject: AccessSubject, input: MciCheckInInput): Promise<{ ok: true; responderId; zoneId: string|null; commandRole } | { ok: false; code: 'NO_OPEN_INCIDENT' | 'NOT_FOUND' }>` — idempotent while checked in; zone from `defaultZoneFor`; role COMMANDER when `canCommandMci(subject)`, else STAFF. Audit `mci.responder.check_in`.
  - `checkOut(subject, responderId)`, `update(subject, responderId, input: MciResponderUpdateInput)` → `{ ok } | { ok:false; code: 'NOT_FOUND'|'FORBIDDEN'|'ALREADY_OUT'|'INCIDENT_CLOSED' }`; uses `mciCan` with the target's current zone: role change is COMMANDER-only (`assignRole`); zone change and check-out of others are COMMANDER, or ZONE_LEAD for responders currently in the lead's zone (`manageResponder`). Audit `mci.responder.update` / `.check_out`.
  - `defaultProfession(personId): Promise<string | null>` via position mapping.
- `class MciPatientService(database, createId?)`
  - `create(subject, input: MciNewPatientInput): Promise<{ ok: true; patientId; tag } | { ok:false; code: 'NO_OPEN_INCIDENT'|'FORBIDDEN'|'NOT_FOUND' }>` — locks incident row, `patient_seq + 1`, status = `intakeStatusId` (black → deceased status). Audit `mci.patient.create` `{ tag, triageCode }`.
  - `update(subject, patientId, input: MciPatientInput)` → codes `NOT_FOUND|FORBIDDEN|INCIDENT_CLOSED|DESTINATION_REQUIRED|TRIAGE_REQUIRED`; `publicHidden` change only when `mciCan(..)` as COMMANDER, else kept. Audit `mci.patient.update` `{ tag, triageLevelId, statusId, zoneId }`.

- [x] **Step 1: Write failing integration tests**: check-in twice returns same responder; rule puts พยาบาล in ER; no rule → null zone; manager → COMMANDER; ZONE_LEAD moving someone in another zone → FORBIDDEN; 10 concurrent creates → tags MCI-001…MCI-010 unique; STAFF create → FORBIDDEN; ส่งต่อ without destination → DESTINATION_REQUIRED; closed incident update → INCIDENT_CLOSED; audit metadata has no name/HN.
- [x] **Step 2–4:** run FAIL → implement → PASS.
- [x] **Step 5: Commit** `feat(mci): add check-in, staffing and casualty services`

### Task 7: Queries and the public projection

**Files:**
- Create: `packages/core/src/mass-casualty/mci-queries.ts`, `mci-public-board.ts`, `mci-public-board.test.ts`, `mci-queries.integration.test.ts`

**Interfaces (Produces):**
- `buildPublicBoard(incident, patients: PatientRow[], settings: MciSettings): PublicBoard` (pure) where `PublicBoard = { incident: { title; kind; occurredAt } | null; updatedAt: string; total: number; byTriage: {name; colorHex; count}[]; byStatus: {name; count}[] (deceased excluded); people: { name: string; place: string }[] (sorted by name); contactPhone: string }`. Place: zone name, `ส่งต่อ <รพ.>`, `กลับบ้านแล้ว`, or `กรุณาติดต่อจุดประชาสัมพันธ์` (deceased or hidden).
- `class MciQueries(database)`: `openIncident()`, `incident(id)`, `incidents(kind?)`, `myResponder(incidentId, personId)`, `responders(incidentId)` (with display name, profession, zone, role, times), `staffing(incidentId)` (zone × profession counts of checked-in), `patients(incidentId, filter)`, `patient(id)`, `publicBoard(): Promise<PublicBoard>`, `summary(incidentId)`.

- [x] **Step 1: Write failing unit test** for `buildPublicBoard`: no surname/HN/tag/colour in serialised output (`JSON.stringify` does not contain `ใจดี`, `HN`, `MCI-`), deceased named → contact text, hidden → contact text, unnamed → absent but counted, byStatus excludes deceased. Integration: `publicBoard()` with no open incident returns `incident: null`.
- [x] **Step 2–4:** FAIL → implement → PASS.
- [x] **Step 5: Commit** `feat(mci): add queries and public board projection`

### Task 8: Worker LINE broadcast

**Files:**
- Create: `apps/worker/src/consumers/mci-line-broadcast-consumer.ts`, `.test.ts`
- Modify: `apps/worker/src/consumers/notification-consumer.ts` (route `mci.line.broadcast`), `apps/worker/src/consumers/line-alert-consumer.ts` (`lineModuleLabels['mass-casualty'] = 'อุบัติเหตุหมู่'`), `apps/worker/src/database-line-store.ts` (`incidentTitle(id): Promise<{ title; kind } | null>`), `apps/worker/src/main.ts`

**Interfaces:** `buildMciBroadcast(kind, event, title, link|null): { type: 'text'; text }` → `[อุบัติเหตุหมู่] ประกาศเหตุ: <title>\nรายงานตัว: <link>` (OPENED) / `[อุบัติเหตุหมู่] ปิดเหตุแล้ว: <title>` (CLOSED), prefixed `[ซ้อมแผน] ` for DRILL. Push to the module route group, retry key = event id, same success/409/throw rules as `LineAlertConsumer`; no client/route/incident → done.

- [x] **Step 1–4:** tests for message text, no-route no-op, 500 → throws `LINE_PUSH_FAILED`; FAIL → implement → PASS (`pnpm --filter @backoffice/worker test`).
- [x] **Step 5: Commit** `feat(worker): broadcast mass casualty incidents to LINE`

### Task 9: API routes

**Files:**
- Create under `apps/web/src/app/api/mci/`: `mci-route.ts` (helpers + `mciResult` status map: NOT_FOUND 404, FORBIDDEN 403, INCIDENT_ALREADY_OPEN/INCIDENT_CLOSED/NO_OPEN_INCIDENT/ALREADY_OUT/DUPLICATE_NAME/PROTECTED 409, else 400), `board/route.ts` (GET, public), `incidents/route.ts` (POST open), `incidents/[id]/closure/route.ts` (POST), `incidents/[id]/export/route.ts` (GET `?kind=patients|responders`, CSV with BOM, `mci.command` only, audit `mci.incident.export`, CLOSED only), `check-in/route.ts` (POST), `responders/[id]/route.ts` (PATCH), `responders/[id]/check-out/route.ts` (POST), `patients/route.ts` (POST), `patients/[id]/route.ts` (PUT), `settings/[kind]/route.ts` (POST create / `settings/[kind]/[id]/route.ts` PUT) for zones|triage|statuses|professions, `settings/rules/route.ts` (PUT), `settings/contact/route.ts` (PUT); `route.test.ts`.

- [x] **Step 1: Write failing route tests** (mock services like `api/fleet/route.test.ts`): 401 signed out on every write; `board` answers 200 without a session and sets `no-store`; open/close/settings/export 403 for staff, 200/201 for `mci-manager`; open conflict → 409; invalid body → 400 with field names only.
- [x] **Step 2–4:** FAIL → implement → PASS (`pnpm --filter @backoffice/web test -- api/mci`).
- [x] **Step 5: Commit** `feat(web): add mass casualty API`

### Task 10: Registry, labels, styles, sign-in redirect

**Files:**
- Modify: `apps/web/src/lib/modules.ts` (entry with sections `/mci/ops` ภาพรวม everyone, `/mci/patients` everyone (page checks), `/mci/staff` everyone, `/mci/incidents` `canCommandMci`, `/mci/settings` `canCommandMci`), `apps/web/src/lib/admin-labels.ts`, `apps/web/src/lib/role-choice-labels.ts`, `packages/i18n/src/th.ts` (all `mci*` keys), `apps/web/src/app/styles.css` (`[data-module="mass-casualty"] { --accent: #b91c1c; }`, `.mci-*` styles, board styles, print CSS), `apps/web/src/app/local-sign-in-form.tsx` (`next?: string` prop, `safeNext(next) → string` accepts only `^/(?!/)` paths without `\`), `apps/web/src/lib/mci-labels.ts`; tests `modules.test.ts`, `local-sign-in-form.test.tsx`, `module-gate.test.ts`.
- [x] **Step 1: Failing tests**: registry has `mass-casualty` with href `/mci`; `moduleForPath('/mci/board') === 'mass-casualty'`; sign-in with `next='/mci/ops'` pushes `/mci/ops`, with `//evil.com` pushes `/dashboard`.
- [x] **Step 2–4:** FAIL → implement → PASS.
- [x] **Step 5: Commit** `feat(web): register the mass casualty module`

### Task 11: Pages

**Files:**
- Create: `apps/web/src/app/mci/page.tsx` (public landing: signed in → `redirect('/mci/ops')`; else red banner with open incident or "ขณะนี้ไม่มีเหตุ", DRILL banner, `<LocalSignInForm next="/mci/ops" />`, link to board), `apps/web/src/app/mci/board/page.tsx` + `board-view.tsx` (client, polls `/api/mci/board` every 30 s, search box), `apps/web/src/app/(app)/mci/layout.tsx`, `mci-page.tsx` (context helper like `fleetContext`), `ops/page.tsx` (my-duty card + counts by colour/status + incident banner), `ops/check-in-card.tsx` (ActionDialog with profession select prefilled), `patients/page.tsx` + `patient-form.tsx` (FormDialog new/edit; tag shown large after create), `staff/page.tsx` + `responder-actions.tsx` (move/role/check-out dialogs, staffing grid), `incidents/page.tsx` + `open-incident-form.tsx` + `close-incident-button.tsx`, `incidents/[id]/page.tsx` (summary, print, CSV links), `settings/page.tsx` + forms per tab; tests `board-view.test.tsx`, `check-in-card.test.tsx`, `patient-form.test.tsx`.
- [x] **Step 1: Failing component tests**: board view renders counts and filters names by search; check-in confirm posts `{ professionId }` and shows the zone; patient form requires colour and zone, shows destination when ส่งต่อ selected, and Esc does not close the dialog.
- [x] **Step 2–4:** FAIL → implement → PASS.
- [x] **Step 5: Commit** `feat(web): add mass casualty pages and public board`

### Task 12: Docs and verification

**Files:** `CONTEXT.md` (section อุบัติเหตุหมู่ with the spec glossary), `DESIGN.md` (colour row, board rules), `docs/integration/modules.md` if it lists modules.
- [x] Run: `pnpm lint && pnpm typecheck && pnpm test`, `DATABASE_URL=… DATABASE_ADMIN_URL=… pnpm test:integration`, `pnpm --filter @backoffice/web build`, `git diff --check` — all exit 0.
- [x] Screenshots 1280/390 of `/mci`, `/mci/board`, `/mci/ops`, `/mci/patients` into `/mnt/project-files/mass-casualty/screens/`.
- [x] Commit `docs: record mass casualty vocabulary and design rules`
