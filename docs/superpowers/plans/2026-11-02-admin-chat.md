# แชตกับผู้ดูแลระบบ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** A Facebook-style chat bubble on every signed-in page: each person talks only to ผู้ดูแลระบบ (one conversation), ผู้ดูแลระบบ share one inbox and open up to 3 chat windows at once; images can be attached or pasted.

**Architecture:** Two tables (`support_conversation`, `support_message`); `SupportChatService` in `packages/core` owns every rule and check; thin Next.js routes under `/api/support-chat`; one client component `SupportChat` mounted by `AppShell`, polling the API.

**Tech Stack:** TypeScript, zod, MariaDB (mysql2 via `@backoffice/db`), Next.js route handlers, React client components, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-02-admin-chat-design.md`

## Global Constraints

- Message body trimmed, 1–2,000 characters, or empty when an image is attached; at least one of body/image.
- Images: `image/jpeg`, `image/png`, `image/webp`, ≤ 10 MB (`MAX_ATTACHMENT_BYTES`), uploaded by the sender.
- Message text never goes to logs, audit metadata, notifications or outbox. Audit action `support.message.sent`, metadata `{ conversationId, hasAttachment }` only, same transaction as the message.
- UTC `DATETIME(3)` in the database; display Asia/Bangkok.
- Chat windows close only from their own buttons (× / –); Esc and outside clicks do nothing.
- Poll every 5 s while a window is open, 30 s for the bubble count.
- Thai copy via `@backoffice/i18n` `t()`.

## Review Focus

- A person posting into someone else's conversation id → 404 (service never takes a conversation id from a non-admin).
- A person attaching an attachment id someone else uploaded, or a PDF → `INVALID_ATTACHMENT`.
- A non-admin calling admin endpoints → 403.
- Whitespace-only message with no image → `EMPTY_MESSAGE`, nothing written.
- Admin opening a 4th window → oldest closes; Esc in a window → stays open.

---

### Task 1: Contract + migration + schema

**Files:** Create `packages/contracts/src/support-chat.ts` (+ `.test.ts`), `packages/db/migrations/0026_support_chat.sql`, `packages/db/src/schema/support-chat.ts`; Modify `packages/contracts/src/index.ts`, `packages/db/src/migrate.ts`, `packages/db/src/index.ts`, `packages/db/src/migrate.test.ts` (last version is now 0026).

**Produces:** `supportMessageInputSchema` (`{ body?: string; attachmentId?: string }`, trims, refines non-empty), `SupportMessageInput`, `SUPPORT_MESSAGE_MAX_LENGTH = 2000`, `supportChatImageContentTypeSchema`, types `SupportMessage { id; fromAdmin; senderName; body: string | null; attachmentId: string | null; createdAt: string; mine: boolean }`, `SupportConversationSummary { id; personId; displayName; positionTitle; lastMessage: string | null; lastHasImage: boolean; lastMessageAt: string; unread: number }`.

- [x] Test: empty/whitespace body without image fails; 2,001 chars fails; image only passes; body is trimmed. Run `pnpm --filter @backoffice/contracts test` → FAIL, implement, PASS.
- [x] Migration + drizzle schema + version list; `pnpm --filter @backoffice/db test` PASS.
- [x] Commit `feat(chat): support chat contract and tables`.

### Task 2: SupportChatService (core)

**Files:** Create `packages/core/src/support-chat/support-chat-service.ts`, `support-chat-service.integration.test.ts`; Modify `packages/core/src/index.ts`, `packages/core/src/files/attachment-access.ts`.

**Interfaces (produces):**
- `sendAsPerson(subject: AccessSubject, input: SupportMessageInput): Promise<Result<{ id: string; conversationId: string }>>`
- `sendAsAdmin(subject, conversationId: string, input): Promise<Result<…>>`
- `myMessages(subject): Promise<SupportMessage[]>` (last 200, oldest first)
- `adminMessages(subject, conversationId): Promise<Result<{ person: { id; displayName; positionTitle }; messages: SupportMessage[] }>>`
- `adminInbox(subject): Promise<Result<SupportConversationSummary[]>>`
- `markReadByPerson(subject)`, `markReadByAdmin(subject, conversationId)`
- `unreadCount(subject): Promise<number>` (admin → conversations waiting; else → admin messages unread)
- `Result<T> = { ok: true } & T | { ok: false; code: 'FORBIDDEN' | 'NOT_FOUND' | 'EMPTY_MESSAGE' | 'INVALID_ATTACHMENT' }`
- `AttachmentAccess.canDownload` also allows conversation owner and ผู้ดูแลระบบ for an attachment in `support_message`.

- [x] Integration tests (skip without `DATABASE_URL`): person send creates conversation, second send reuses it, audit row metadata has no body; admin inbox lists with unread 1, mark read → 0; person unread counts admin reply then 0 after read; non-admin `adminInbox`/`sendAsAdmin` → FORBIDDEN; someone else's attachment or PDF → INVALID_ATTACHMENT; whitespace → EMPTY_MESSAGE; AttachmentAccess allows owner + admin, refuses a third person.
- [x] Run against local MariaDB → FAIL, implement, PASS. Commit `feat(chat): SupportChatService`.

### Task 3: API routes

**Files:** Create under `apps/web/src/app/api/support-chat/`: `chat-route.ts` (status map), `summary/route.ts`, `mine/route.ts`, `mine/messages/route.ts`, `mine/read/route.ts`, `conversations/route.ts`, `conversations/[conversationId]/route.ts`, `…/messages/route.ts`, `…/read/route.ts`, `images/route.ts` (POST upload), `images/[attachmentId]/route.ts` (GET inline), `route.test.ts`.

Status map: FORBIDDEN 403, NOT_FOUND 404, EMPTY_MESSAGE 400, INVALID_ATTACHMENT 400. Image GET: `content-disposition: inline`, `x-content-type-options: nosniff`, `cache-control: private, max-age=3600`, `openAttachment(..., { recordDownload: false })`.

- [x] Tests (mock service/session like existing route tests): 401 unauthenticated; mine/messages forwards body; admin conversations 403 for non-admin via service result; images POST rejects `application/pdf` with 415.
- [x] Implement, `pnpm --filter @backoffice/web test -- support-chat` PASS. Commit `feat(chat): support chat API`.

### Task 4: SupportChat UI

**Files:** Create `apps/web/src/components/support-chat.tsx`, `support-chat-window.tsx`, `support-chat.test.tsx`; Modify `app-shell.tsx`, `(app)/layout.tsx`, `lib/shell-data.ts` (adds `chat: { admin: boolean; images: boolean; unread: number }`), `app/styles.css`, `packages/i18n/src/th.ts`, `CONTEXT.md`, `DESIGN.md`.

**Interfaces:** `SupportChat({ admin, images, unread })`; `SupportChatWindow({ title, source: { list: string; send: string; read: string }, images, onClose, onMinimize })`.

- [x] Tests: bubble shows unread count; person click opens window titled ผู้ดูแลระบบ and loads `/api/support-chat/mine`; Enter sends POST to `/mine/messages`, Shift+Enter does not; pasting an image file shows a preview and sends after upload to `/images`; Esc keeps window open; admin opens 4 conversations → 3 windows remain (first closed).
- [x] Implement, tests PASS. Commit `feat(chat): chat bubble and windows`.

### Task 5: Verify

- [x] `pnpm lint && pnpm typecheck && pnpm test`, `DATABASE_URL=… pnpm test:integration`, `git diff --check`; screenshots desktop/mobile to `/mnt/project-files/screenshots/support-chat/`.
