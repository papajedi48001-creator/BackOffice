# R0 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a secure, pilot-ready Back Office foundation: HR master data, local authentication with an OIDC-ready boundary, authorization, delegation, workflow, audit, files, notifications, and operable container deployment.

**Architecture:** A TypeScript workspace contains a Next.js web/API application and a worker. Business capabilities are modular packages; MariaDB owns transactional data and an outbox, Redis schedules background jobs, and private object storage holds attachments. The web app and worker call the same domain services, keeping module ownership intact while shipping one deployable system.

**Tech Stack:** React, Next.js App Router, TypeScript, MariaDB, Drizzle ORM/migrations, Redis, BullMQ, S3-compatible object storage, Docker Compose, Vitest, Playwright, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-30-waritch-hospital-back-office-design.md`

## Global Constraints

- Deploy one hospital organization with `site` and `location`; do not add multi-tenant behavior.
- Store timestamps in UTC and render them with the Asia/Bangkok time zone.
- Use UUID identifiers; no route, export, audit record, or notification may contain an unmasked national ID.
- HR owns people and organization data; system administrators do not gain HR or donor data access implicitly.
- Enforce authorization on the server by role, organization scope, and data owner; never rely on UI visibility.
- Workflow snapshots requestor, organization, and approvers at submission time.
- A delegate cannot approve their own request or a request in which they have a declared conflict.
- Audit events are append-only in behavior and redact protected data before persistence.
- Upload only PDF/JPG/PNG after MIME, size, and malware checks; attachment objects remain private.
- R0 supports local accounts and an OIDC integration boundary, but production OIDC mapping waits for the actual SSO issuer, client, claims, and test login.
- Production remains Docker Compose on a Linux VM with HTTPS, internal-only database services, encrypted daily backup, and a restore drill meeting RPO <= 24 hours.
- User-facing copy is Thai-first; all new copy must be translatable.

## Review Focus

- A crafted server request for an invisible HR record must be denied even if the UI would normally hide it.
- A person moving units after submitting a request must not change that request's historical approver snapshot.
- An expired or self-referential delegation must never produce an approval action.
- Concurrent submission of the same logical background event must result in one externally delivered notification.
- A renamed executable or image pretending to be a supported attachment must never be made downloadable.

---

## File Structure

| Path | Responsibility |
|---|---|
| `package.json`, `pnpm-workspace.yaml` | Root workspace scripts and package boundaries |
| `apps/web/` | Next.js Thai-first UI, route handlers, session boundary, server-side authorization |
| `apps/worker/` | BullMQ consumers for outbox, email, import, and operational jobs |
| `packages/db/` | Drizzle schema, migrations, transaction utilities, repositories |
| `packages/contracts/` | Zod-backed request, event, and job payload contracts |
| `packages/core/` | Organization, people, access, delegation, workflow, audit, file, and notification use cases |
| `packages/i18n/` | Thai catalog and translation lookup abstraction |
| `infra/compose/` | Development, staging, and production Compose definitions and environment samples |
| `infra/caddy/` | HTTPS reverse-proxy configuration |
| `infra/backup/` | Encrypted backup, restore-verification, and retention scripts |
| `.github/workflows/ci.yml` | Lint, types, unit/integration tests, build, migration validation, and container build |
| `docs/runbooks/` | Deploy, restore, connector failure, secret rotation, and backfill procedures |

### Task 1: Bootstrap the workspace and repeatable local stack

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `.env.example`
- Create: `apps/web/package.json`, `apps/web/next.config.ts`, `apps/web/tsconfig.json`, `apps/web/src/app/layout.tsx`, `apps/web/src/app/page.tsx`
- Create: `apps/worker/package.json`, `apps/worker/src/index.ts`
- Create: `packages/contracts/package.json`, `packages/core/package.json`, `packages/db/package.json`, `packages/i18n/package.json`
- Create: `infra/compose/docker-compose.dev.yml`, `infra/compose/.env.dev.example`
- Test: `apps/web/src/app/page.test.tsx`, `apps/worker/src/index.test.ts`

**Interfaces:**
- Produces: workspace scripts `lint`, `typecheck`, `test`, `test:integration`, `build`, `dev:infra`; import aliases `@backoffice/{contracts,core,db,i18n}`.
- Consumes: none.

- [ ] **Step 1: Write failing smoke tests for the web health page and worker bootstrap**

```ts
it('renders the Thai Back Office title', () => {
  expect(render(<HomePage />).getByRole('heading')).toHaveTextContent('ระบบ Back Office');
});

it('creates the worker application without starting consumers', () => {
  expect(createWorkerApplication({ start: false })).toBeDefined();
});
```

- [ ] **Step 2: Run the smoke tests to verify they fail**

Run: `pnpm test --filter @backoffice/web -- --runInBand`

Expected: FAIL because the workspace applications do not exist.

- [ ] **Step 3: Create the pnpm workspace, Next.js application, worker entry point, and development Compose stack**

Expose `createWorkerApplication(options: { start: boolean }): WorkerApplication`. Make `docker-compose.dev.yml` create internal `mariadb`, `redis`, and `minio` services with persistent named volumes; expose service ports only for local development. Add root scripts that run each package without install-on-run behavior.

- [ ] **Step 4: Run the smoke tests, type check, and local build**

Run: `pnpm test && pnpm typecheck && pnpm build`

Expected: PASS; the web app builds and the worker entry point type checks.

- [ ] **Step 5: Commit the bootstrap**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .gitignore .env.example apps packages infra
git commit -m "build: bootstrap back office workspace"
```

### Task 2: Create the MariaDB schema and migration discipline

**Files:**
- Create: `packages/db/src/client.ts`, `packages/db/src/schema/core.ts`, `packages/db/src/schema/hr.ts`, `packages/db/src/schema/access.ts`, `packages/db/src/schema/workflow.ts`, `packages/db/src/schema/audit.ts`, `packages/db/src/schema/files.ts`, `packages/db/src/schema/outbox.ts`
- Create: `packages/db/src/migrate.ts`, `packages/db/drizzle.config.ts`, `packages/db/migrations/0000_r0_foundation.sql`
- Create: `packages/db/src/index.ts`
- Test: `packages/db/src/schema/schema.integration.test.ts`

**Interfaces:**
- Produces: `createDatabase(connectionUrl: string): Database`, `runMigrations(db: Database): Promise<void>`, and repository-ready tables.
- Consumes: workspace configuration from Task 1.

- [ ] **Step 1: Write an integration test for foundational constraints**

```ts
it('allows one active person identity link per OIDC issuer and subject', async () => {
  await seedPerson(db, { personId, nationalIdCiphertext: encryptedId, nationalIdLookup: lookup });
  await linkIdentity(db, { personId, issuer: 'https://sso.example', subject: 'a' });
  await expect(linkIdentity(db, { personId, issuer: 'https://sso.example', subject: 'a' }))
    .rejects.toThrow();
});
```

- [ ] **Step 2: Run the integration test to verify it fails**

Run: `pnpm --filter @backoffice/db test:integration -- schema.integration.test.ts`

Expected: FAIL because the schema and migration are absent.

- [ ] **Step 3: Define Drizzle tables and the first migration**

Create tables for organization, site, location, person, employment assignment (with effective dates), identity link, local account, role, permission, role assignment, data-owner assignment, delegation, request, approval step, approval decision, audit event, attachment, attachment scan, outbox event, notification, and export event. Use UUID primary keys, UTC timestamps, unique/foreign-key constraints, and indexes for active employment, issuer/subject, workflow queue, and outbox processing. Store `national_id_ciphertext` and `national_id_lookup` only on HR-person data; `national_id_lookup` is a keyed HMAC digest.

- [ ] **Step 4: Run migrations and schema integration tests against MariaDB**

Run: `pnpm dev:infra && pnpm --filter @backoffice/db migrate && pnpm --filter @backoffice/db test:integration`

Expected: PASS; migration is repeatable on a new database and duplicate identity links are rejected.

- [ ] **Step 5: Commit the schema**

```bash
git add packages/db
git commit -m "feat: add R0 MariaDB foundation schema"
```

### Task 3: Implement HR organization, identity, and server authorization

**Files:**
- Create: `packages/contracts/src/identity.ts`, `packages/contracts/src/hr.ts`, `packages/contracts/src/access.ts`
- Create: `packages/core/src/hr/person-service.ts`, `packages/core/src/hr/organization-service.ts`, `packages/core/src/identity/auth-service.ts`, `packages/core/src/access/authorization-service.ts`, `packages/core/src/access/policy.ts`
- Create: `packages/core/src/crypto/national-id.ts`, `packages/core/src/index.ts`
- Create: `apps/web/src/lib/session.ts`, `apps/web/src/lib/require-authorized.ts`, `apps/web/src/app/api/auth/local/route.ts`, `apps/web/src/app/api/health/route.ts`
- Test: `packages/core/src/hr/person-service.test.ts`, `packages/core/src/access/authorization-service.test.ts`, `apps/web/src/lib/require-authorized.test.ts`

**Interfaces:**
- Produces: `createPerson(input: CreatePersonInput): Promise<Person>`, `assignEmployment(input: AssignEmploymentInput): Promise<EmploymentAssignment>`, `authenticateLocal(credentials: LocalCredentials): Promise<Session>`, `canAccess(subject: AccessSubject, action: Permission, resource: AccessResource): Promise<AuthorizationDecision>`.
- Consumes: `Database` from Task 2 and Zod contracts defined in this task.

- [ ] **Step 1: Write failing tests for protected identity and data-scope enforcement**

```ts
it('returns a masked national ID and never the ciphertext', async () => {
  const person = await createPerson({ nationalId: '1234567890123', ...personInput });
  expect(person.nationalIdMasked).toBe('1-2345-67890-12-3');
  expect(JSON.stringify(person)).not.toContain('1234567890123');
});

it('denies a role holder outside the assigned organization scope', async () => {
  await expect(canAccess(actor, 'hr.person.read', otherUnitPerson)).resolves.toMatchObject({ allowed: false });
});
```

- [ ] **Step 2: Run the access tests to verify they fail**

Run: `pnpm --filter @backoffice/core test -- person-service authorization-service`

Expected: FAIL because the services and policy evaluator are absent.

- [ ] **Step 3: Implement HR, local-session, OIDC boundary, and policy services**

Implement national-ID encryption and HMAC lookup behind `NationalIdProtector`; only `createPerson` and approved HR lookup use its plaintext input. Define `OidcIdentityProvider` with `getAuthorizationUrl()` and `resolveIdentity(callback): Promise<ExternalIdentity>` but do not configure a production issuer. Make `canAccess` evaluate authenticated identity, role, organization scope, data-owner rule, and action. Route handlers must call `requireAuthorized` before reading protected data.

- [ ] **Step 4: Run unit tests and authorization route tests**

Run: `pnpm --filter @backoffice/core test && pnpm --filter @backoffice/web test`

Expected: PASS; cross-unit access is denied and sensitive identifiers do not appear in serialized results.

- [ ] **Step 5: Commit identity and authorization**

```bash
git add packages/core packages/contracts apps/web/src/lib apps/web/src/app/api
git commit -m "feat: add HR identity and scoped authorization"
```

### Task 4: Implement delegation, workflow snapshots, and append-only audit

**Files:**
- Create: `packages/contracts/src/workflow.ts`, `packages/contracts/src/audit.ts`, `packages/contracts/src/outbox.ts`
- Create: `packages/core/src/access/delegation-service.ts`, `packages/core/src/workflow/request-service.ts`, `packages/core/src/workflow/approval-service.ts`, `packages/core/src/audit/audit-service.ts`, `packages/core/src/audit/redact.ts`
- Create: `apps/web/src/app/api/requests/route.ts`, `apps/web/src/app/api/requests/[requestId]/decisions/route.ts`
- Test: `packages/core/src/access/delegation-service.test.ts`, `packages/core/src/workflow/request-service.test.ts`, `packages/core/src/audit/audit-service.test.ts`

**Interfaces:**
- Produces: `grantDelegation(input: GrantDelegationInput): Promise<Delegation>`, `submitRequest(input: SubmitRequestInput): Promise<SubmittedRequest>`, `getPendingApprover(requestId: UUID): Promise<ApproverSnapshot | null>`, `decideRequest(input: DecideRequestInput): Promise<ApprovalDecision>`, `recordAudit(event: AuditInput): Promise<void>`, and the `OutboxEvent` contract.
- Consumes: `canAccess` from Task 3 and workflow tables from Task 2.

- [ ] **Step 1: Write failing workflow and conflict-of-interest tests**

```ts
it('keeps the approver snapshot when the requestor changes employment after submission', async () => {
  const request = await submitRequest(submittedRequest);
  await assignEmployment({ ...newUnitAssignment, personId: request.requestorId });
  expect(await getPendingApprover(request.id)).toEqual(request.approvalSteps[0].assigneeSnapshot);
});

it('rejects an approval by a delegate when the delegate is the requestor', async () => {
  await expect(decideRequest(selfDelegateDecision)).rejects.toThrow('CONFLICT_OF_INTEREST');
});
```

- [ ] **Step 2: Run workflow tests to verify they fail**

Run: `pnpm --filter @backoffice/core test -- delegation-service request-service approval-service audit-service`

Expected: FAIL because workflow state transitions and audit services are absent.

- [ ] **Step 3: Implement standard request lifecycle and audit redaction**

Implement `DRAFT`, `SUBMITTED`, `IN_REVIEW`, `RETURNED`, `REJECTED`, `CANCELLED`, `APPROVED`, and `FULFILLED`. Submission resolves and persists approver snapshots in one transaction. Decisions require a reason where the policy requires one, use delegation only when active and in scope, and emit an outbox event in the same transaction. `recordAudit` serializes a redacted metadata allowlist and never mutates/deletes recorded events through application APIs.

- [ ] **Step 4: Run workflow, audit, and integration tests**

Run: `pnpm --filter @backoffice/core test && pnpm --filter @backoffice/core test:integration`

Expected: PASS; historical approvers remain fixed, self-delegation is denied, and audit payloads contain no protected identifiers.

- [ ] **Step 5: Commit workflow and audit**

```bash
git add packages/contracts packages/core apps/web/src/app/api/requests
git commit -m "feat: add auditable approval workflow"
```

### Task 5: Add private attachments, export controls, outbox, and notifications

**Files:**
- Create: `packages/contracts/src/files.ts`, `packages/contracts/src/notifications.ts`
- Create: `packages/core/src/files/attachment-service.ts`, `packages/core/src/files/scan-service.ts`, `packages/core/src/exports/export-service.ts`, `packages/core/src/outbox/outbox-service.ts`, `packages/core/src/notifications/notification-service.ts`
- Create: `apps/web/src/app/api/attachments/route.ts`, `apps/web/src/app/api/attachments/[attachmentId]/download/route.ts`, `apps/web/src/app/api/exports/route.ts`
- Create: `apps/worker/src/consumers/outbox-consumer.ts`, `apps/worker/src/consumers/notification-consumer.ts`
- Test: `packages/core/src/files/attachment-service.test.ts`, `packages/core/src/exports/export-service.test.ts`, `apps/worker/src/consumers/outbox-consumer.integration.test.ts`

**Interfaces:**
- Produces: `uploadAttachment(input: UploadAttachmentInput): Promise<Attachment>`, `createDownloadUrl(input: DownloadInput): Promise<TemporaryUrl>`, `requestExport(input: ExportRequestInput): Promise<ExportJob>`, `publishOutboxBatch(): Promise<PublishResult>`.
- Consumes: authorization/audit from Tasks 3–4 and object/queue clients configured here.

- [ ] **Step 1: Write failing tests for attachment spoofing, export authorization, and duplicate outbox delivery**

```ts
it('rejects an executable renamed to a PDF', async () => {
  await expect(uploadAttachment(executableNamedPdf)).rejects.toThrow('INVALID_FILE_CONTENT');
});

it('requires export permission even when the actor can view the data', async () => {
  await expect(requestExport(viewOnlyActorRequest)).rejects.toThrow('FORBIDDEN');
});

it('delivers a notification once when an outbox event is retried', async () => {
  await publishOutboxBatch(); await publishOutboxBatch();
  expect(emailProvider.sentFor(eventId)).toHaveLength(1);
});
```

- [ ] **Step 2: Run attachment, export, and worker tests to verify they fail**

Run: `pnpm --filter @backoffice/core test -- attachment-service export-service && pnpm --filter @backoffice/worker test:integration`

Expected: FAIL because storage, export, and worker consumers are absent.

- [ ] **Step 3: Implement private storage and asynchronous delivery**

Accept only PDF/JPG/PNG after byte-signature, MIME, size, and malware-scan checks. Keep objects private until an authorized request creates a short-lived download URL. Require `data.export` permission and reason text, then write an export audit event before queueing generation. Give every outbox event an idempotency key; consumers persist delivery state before retrying. Implement in-app and email providers only; expose a `LineNotificationProvider` interface without credentials or implementation.

- [ ] **Step 4: Run file, export, and outbox integration tests**

Run: `pnpm --filter @backoffice/core test && pnpm --filter @backoffice/worker test:integration`

Expected: PASS; spoofed uploads fail, view-only actors cannot export, and retry does not duplicate delivery.

- [ ] **Step 5: Commit files and notifications**

```bash
git add packages/contracts packages/core apps/web/src/app/api/attachments apps/web/src/app/api/exports apps/worker
git commit -m "feat: add secure files exports and notifications"
```

### Task 6: Build the Thai-first R0 administration and workflow UI

**Files:**
- Create: `packages/i18n/src/th.ts`, `packages/i18n/src/index.ts`
- Create: `apps/web/src/app/(app)/layout.tsx`, `apps/web/src/app/(app)/dashboard/page.tsx`
- Create: `apps/web/src/app/(app)/hr/people/page.tsx`, `apps/web/src/app/(app)/hr/organizations/page.tsx`, `apps/web/src/app/(app)/access/roles/page.tsx`, `apps/web/src/app/(app)/access/delegations/page.tsx`
- Create: `apps/web/src/app/(app)/requests/page.tsx`, `apps/web/src/app/(app)/requests/[requestId]/page.tsx`, `apps/web/src/app/(app)/audit/page.tsx`, `apps/web/src/components/*`
- Test: `apps/web/src/app/(app)/requests/[requestId]/page.test.tsx`, `apps/web/e2e/r0-workflow.spec.ts`

**Interfaces:**
- Produces: role-aware navigation and pages consuming the Task 3–5 server interfaces.
- Consumes: contracts and services from Tasks 3–5; Thai messages from this task.

- [ ] **Step 1: Write failing UI and end-to-end tests for the core approval path**

```ts
test('requestor submits and approver approves a request with Thai status labels', async ({ page }) => {
  await signInAs(page, 'requestor');
  await submitFoundationRequest(page);
  await signInAs(page, 'approver');
  await expect(page.getByText('รอพิจารณา')).toBeVisible();
  await approveRequest(page);
  await expect(page.getByText('อนุมัติแล้ว')).toBeVisible();
});
```

- [ ] **Step 2: Run the UI test to verify it fails**

Run: `pnpm --filter @backoffice/web test && pnpm --filter @backoffice/web test:e2e -- r0-workflow`

Expected: FAIL because protected pages, Thai catalog, and workflow UI are absent.

- [ ] **Step 3: Implement accessible Thai-first administration screens**

Create server-protected screens for people, organization, roles, delegations, requests, audit lookup, and notifications. Mask national IDs in every view. Show only navigation/actions allowed by server-provided permissions; keep server authorization as the enforcement point. Every literal user-facing string must be served by `@backoffice/i18n` and have a Thai default.

- [ ] **Step 4: Run component, end-to-end, accessibility, and production build checks**

Run: `pnpm --filter @backoffice/web test && pnpm --filter @backoffice/web test:e2e && pnpm --filter @backoffice/web build`

Expected: PASS; the complete request path works and no protected UI reveals an unmasked national ID.

- [ ] **Step 5: Commit the R0 UI**

```bash
git add packages/i18n apps/web
git commit -m "feat: add Thai foundation administration UI"
```

### Task 7: Make the production Compose stack, backup, and runbooks operable

**Files:**
- Create: `infra/compose/docker-compose.staging.yml`, `infra/compose/docker-compose.production.yml`, `infra/compose/.env.production.example`
- Create: `infra/caddy/Caddyfile`
- Create: `infra/backup/backup.sh`, `infra/backup/restore-verify.sh`, `infra/backup/README.md`
- Create: `docs/runbooks/deploy.md`, `docs/runbooks/restore.md`, `docs/runbooks/connector-failure.md`, `docs/runbooks/secret-rotation.md`, `docs/runbooks/backfill.md`
- Test: `infra/backup/restore-verify.test.sh`, `infra/compose/compose-config.test.sh`

**Interfaces:**
- Produces: documented `deploy`, `backup`, and `restore-verify` operator procedures.
- Consumes: application images from Tasks 1–6 and environment variables documented in `.env.production.example`.

- [ ] **Step 1: Write failing operational tests for network isolation and restore verification**

```bash
assert_no_public_port mariadb
assert_no_public_port redis
assert_no_public_port minio
assert_restore_contains "foundation_person"
```

- [ ] **Step 2: Run the operational tests to verify they fail**

Run: `bash infra/compose/compose-config.test.sh && bash infra/backup/restore-verify.test.sh`

Expected: FAIL because production Compose and backup tooling are absent.

- [ ] **Step 3: Implement staging/production Compose and encrypted backup procedures**

Configure Caddy as the only public HTTP(S) endpoint. Put MariaDB, Redis, and object storage on internal networks. Require secret-file paths rather than committed values. `backup.sh` exports MariaDB and attachment objects, encrypts archives, records completion metadata, and retains them according to operational policy. `restore-verify.sh` restores into isolated staging services and verifies schema plus a known data record. Document manual deployment, migration, health checks, rollback, restore, connector failure, secret rotation, and controlled backfill.

- [ ] **Step 4: Validate Compose and execute a staging restore drill**

Run: `docker compose -f infra/compose/docker-compose.staging.yml config && bash infra/backup/restore-verify.sh`

Expected: PASS; config exposes no internal data service and an encrypted backup restores to isolated staging.

- [ ] **Step 5: Commit operational tooling**

```bash
git add infra docs/runbooks
git commit -m "ops: add R0 deployment and recovery runbooks"
```

### Task 8: Add CI/CD quality gates and R0 pilot evidence pack

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/build-images.yml`
- Create: `docs/pilot/r0-uat-scenarios.md`, `docs/pilot/r0-master-data-sign-off.md`, `docs/pilot/r0-kpi-baseline.md`, `docs/pilot/r0-go-live-checklist.md`
- Create: `scripts/verify-r0.sh`
- Test: `scripts/verify-r0.test.sh`

**Interfaces:**
- Produces: CI required checks and an evidence pack that Data Owners use to decide R0 pilot/go-live.
- Consumes: test/build commands from Tasks 1–7.

- [ ] **Step 1: Write a failing verification-script test**

```bash
assert_output_contains "typecheck"
assert_output_contains "migration validation"
assert_output_contains "restore drill"
assert_output_contains "E2E approval workflow"
```

- [ ] **Step 2: Run the script test to verify it fails**

Run: `bash scripts/verify-r0.test.sh`

Expected: FAIL because the consolidated verification script and pilot evidence files are absent.

- [ ] **Step 3: Implement CI workflows and pilot evidence templates**

CI must run lint, typecheck, unit tests, MariaDB integration tests, worker tests, web build, Playwright E2E, migration validation, secret scan, dependency scan, and image build. Require production deployment approval outside CI. Create UAT scenarios for scoped access, local login, request/approval/return/reject/cancel, delegated approval conflict prevention, masked data/export audit, attachment rejection, and restored backup. The go-live checklist requires HR master-data sign-off, UAT sign-off, training, runbooks, restore evidence, monitoring alert test, and KPI baseline.

- [ ] **Step 4: Run the full R0 verification command**

Run: `bash scripts/verify-r0.sh`

Expected: PASS; it reports every required quality gate and fails nonzero if any gate fails.

- [ ] **Step 5: Commit CI and pilot controls**

```bash
git add .github docs/pilot scripts
git commit -m "ci: add R0 quality and pilot gates"
```

## Plan Self-Review

- **Spec coverage:** Tasks 1–8 cover the R0 platform, HR/org master data, local/OIDC boundary, scoped authorization, delegation, workflow snapshots, audit/export, private files, notifications, worker/outbox, containers, backup/restore, CI, UAT, and go-live evidence. R1–R6 are deliberately excluded per the spec's release boundary.
- **Step scan:** Each implementation step names responsible files, public interfaces, and a focused verification command. External SSO mapping, connector formats, retention durations, and legal document rules remain explicit preconditions rather than guessed code requirements.
- **Type consistency:** `Database`, `AccessSubject`, `AccessResource`, `AuthorizationDecision`, `SubmittedRequest`, `ApprovalDecision`, `Attachment`, `TemporaryUrl`, and `ExportJob` are introduced by the tasks that first produce them and consumed only later.
- **Review focus coverage:** Cross-scope access is tested in Task 3; historical approvers and delegation conflicts in Task 4; duplicate notification delivery in Task 5; spoofed uploads in Task 5.
- **Proportion:** The plan is limited to R0, preserves R1–R6 as later release plans, and uses code only for decisive test examples rather than implementation transcripts.
