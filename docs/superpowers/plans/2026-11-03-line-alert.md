# LINE Alert Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ส่งการแจ้งเตือนที่ต้องดำเนินการเข้ากลุ่ม LINE ของโมดูลพร้อม @mention ผู้รับที่เชื่อมต่อ LINE แล้ว

**Architecture:** ผู้ส่งเดิมติดธง `actionRequired`; worker ต่อคิว `notification.line` แล้ว `LineAlertConsumer` push textV2 ผ่าน Messaging API. Web มี webhook (ลายเซ็น) สำหรับ join/leave และรหัสเชื่อมต่อ, หน้า `/hr/me` สร้างรหัส, หน้า `/admin/line` ตั้งกลุ่มต่อโมดูล. ข้อมูลอยู่ใน 4 ตารางใหม่ ผ่าน `LineService` ใน core.

**Tech Stack:** TypeScript, Next.js 16, MariaDB, zod, vitest, `fetch` + `node:crypto` (ไม่เพิ่ม dependency ภายนอก)

**Spec:** `docs/superpowers/specs/2026-11-03-line-alert-design.md`

## Global Constraints

- ข้อความ: `{m} [<ชื่อโมดูล>] มีคำขอใหม่ 1 รายการ` + `\n<BACKOFFICE_PUBLIC_URL><targetPath>` เมื่อมี URL
- รหัสเชื่อมต่อ: 8 ตัวจาก `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, หมดอายุ 10 นาที, เก็บ sha256 hex
- groupId `^C[0-9a-f]{32}$`, userId `^U[0-9a-f]{32}$`
- รหัส, userId, token, เนื้อข้อความ LINE ห้ามอยู่ใน URL, log, audit metadata, outbox payload
- popup เพิ่ม/แก้ใช้ `FormDialog`, ยืนยันใช้ `ActionDialog`; ปิดได้จากปุ่มเท่านั้น
- ทุกการเปลี่ยนแปลงกับ audit อยู่ใน transaction เดียว; migration additive และอยู่ใน `migrate.ts` + Drizzle schema
- ไม่ตั้ง token = ไม่ส่ง LINE และไม่ error

## Review Focus

- ข้อความที่ผู้ใช้พิมพ์รหัสมีขีด/ช่องว่าง/ตัวเล็ก (`abcd-2345`) → ยังเชื่อมต่อได้ (test ใน Task 2 `normalizeLinkCode`)
- LINE ส่ง webhook ซ้ำ (redelivery) ด้วยรหัสที่ใช้ไปแล้ว → ตอบ "ไม่ถูกต้อง" ไม่ error 500 (Task 4)
- worker retry หลัง push สำเร็จแต่ markProcessed ล้ม → LINE ได้ 409 จาก retry key → ถือว่าสำเร็จ (Task 3)
- บอทถูกเตะออกจากกลุ่ม → route ยังอยู่แต่ไม่ส่ง (Task 3 `left_at`)
- คนสองคนใช้ LINE เดียวกัน → บัญชีย้ายไปคนล่าสุด ไม่ชน UNIQUE (Task 2 integration)

---

### Task 1: Schema + contracts

**Files:** Create `packages/db/migrations/0028_line_alert.sql`, `packages/db/src/schema/line.ts`, `packages/contracts/src/line.ts`; Modify `packages/db/src/migrate.ts`, `packages/db/src/schema/index` export, `packages/contracts/src/notifications.ts`, contracts index; Test `packages/contracts/src/line.test.ts`, `packages/contracts/src/notifications.test.ts`

**Produces:** `lineGroupIdSchema`, `lineUserIdSchema`, `lineRouteInputSchema {groupId: string|null}`, `lineGroupInputSchema {groupId, displayName}`, `notificationEventPayloadSchema.actionRequired?: boolean`, `lineAlertPayloadSchema {recipientPersonId, moduleCode, targetPath}`.

- [ ] Test: schemas accept `C`+32 hex, reject uppercase/short; payload keeps `actionRequired: true`
- [ ] Run `pnpm --filter @backoffice/contracts test` → FAIL
- [ ] Implement schemas, migration (4 tables per spec), Drizzle schema
- [ ] Run tests → PASS; commit `feat(line): add LINE alert schema and contracts`

### Task 2: Core `LineService` + code helpers

**Files:** Create `packages/core/src/line/link-code.ts`, `line-service.ts`, `line-signature.ts`, tests; export from `packages/core/src/index.ts`

**Produces:**
- `generateLinkCode(): string`, `normalizeLinkCode(text: string): string | null`, `hashLinkCode(code): string`
- `verifyLineSignature(secret: string, rawBody: string, signature: string | null): boolean`
- `class LineService(database)`: `createLinkCode(personId): Promise<{code, expiresAt}>`, `linkByCode(code, lineUserId): Promise<{ok:true; personId} | {ok:false}>`, `unlink(personId): Promise<boolean>`, `linkStatus(personId): Promise<{linkedAt: string} | null>`, `groupJoined(groupId, displayName|null)`, `groupLeft(groupId)`, `addGroup(actor, input)`, `setRoute(actor, moduleCode, groupId|null)`, `overview(): {groups, routes, linkedCount}`

- [ ] Unit tests: code alphabet/length, normalize (`abcd-2345 ` → `ABCD2345`, `hello` → null), signature valid/invalid/null
- [ ] Integration tests (skip without DB): link, expired code refused, reused code refused, userId moves between people, join/leave, route to unknown group refused, audits written
- [ ] Implement; tests PASS; commit `feat(line): link LINE accounts and groups in core`

### Task 3: Worker — enqueue and push

**Files:** Create `apps/worker/src/consumers/line-alert-consumer.ts`, `apps/worker/src/line-client.ts`, `apps/worker/src/database-line-store.ts`, tests; Modify `notification-consumer.ts`, `database-outbox-repository.ts` (type list), `main.ts`, `apps/worker/package.json` (+ `@backoffice/i18n`)

**Produces:** `NotificationConsumer(store, email, inApp, lineQueue?, lineAlerts?)`; `LineAlertConsumer(store, client, publicUrl)`; `buildLineAlertMessage(moduleLabel, lineUserId, link|null)`; `LineClient.push(to, messages, retryKey)` throws `LINE_PUSH_FAILED`.

- [ ] Tests: in_app with actionRequired enqueues once; without it does not; `notification.line` dispatched to LineAlertConsumer; consumer skips without route/link/left group; sends textV2 with `{m}` substitution and retry key; 409 = ok; 500 throws
- [ ] Implement; PASS; commit `feat(worker): push action alerts to the module's LINE group`

### Task 4: Producers set `actionRequired`

**Files:** `packages/core/src/workflow/request-service.ts`, `rooms/room-booking-service.ts`, `inventory/receipt-service.ts`, `fleet/fleet-notices.ts` + `fleet-store.ts`; their tests

- [ ] Tests assert payload `actionRequired: true` for the 4 spec subjects and absent for info subjects
- [ ] Implement; PASS; commit `feat(line): mark notices that need the recipient to act`

### Task 5: Web — webhook + link API + `/hr/me` popup

**Files:** Create `apps/web/src/app/api/line/webhook/route.ts`, `api/line/link-code/route.ts`, `api/line/link/route.ts`, `apps/web/src/lib/line-api.ts`, `apps/web/src/components/line-link-dialog.tsx`, tests; Modify `app/(app)/hr/me/page.tsx`, `packages/i18n/src/th.ts`

- [ ] Tests: webhook 401 bad signature, 503 no secret, join stores group, code message links + replies, unknown code replies refusal; link-code requires session; dialog shows code and add-friend link
- [ ] Implement; PASS; commit `feat(web): connect a LINE account from my profile`

### Task 6: Web — `/admin/line`

**Files:** Create `app/(app)/admin/line/page.tsx`, `line-settings.tsx`, `api/admin/line/groups/route.ts`, `api/admin/line/groups/[groupId]/test/route.ts`, `api/admin/line/routes/[code]/route.ts`; Modify `lib/modules.ts` (section), `lib/connection-status.ts` (LINE row), i18n

- [ ] Tests: non-admin 403, add group invalid id 400, route set, connections row lists LINE variables
- [ ] Implement; PASS; commit `feat(admin): choose each module's LINE group`

### Task 7: Docs + verification

**Files:** `CONTEXT.md`, `.env.example`, `docs/runbooks/line-alert.md`

- [ ] Write runbook (OA setup, tunnel, env, steps)
- [ ] Run `pnpm lint && pnpm typecheck && pnpm test`, `git diff --check`; report integration suites as skipped if no DB
- [ ] Commit `docs(line): runbook for LINE alerts`
