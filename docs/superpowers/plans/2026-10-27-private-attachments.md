# Private attachments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Upload, scan, store and download ไฟล์แนบส่วนตัว, and use them on ใบลา and คำขอไปราชการ.

**Architecture:** `packages/core/src/files` holds the service, the clamd scanner, the S3 storage adapter, the MariaDB repository and the access check. `apps/web/src/lib/attachments.ts` builds them from env; two routes and one client field use them.

**Tech Stack:** TypeScript, `@aws-sdk/client-s3` 3.999.0, ClamAV clamd INSTREAM, MariaDB, Next.js 16, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-27-private-attachments-design.md`

## Global Constraints

- Nothing stored without a CLEAN scan; scanner errors fail closed.
- No file name or content in audit, logs, URLs or outbox.
- Download access is decided on the server on every request; 404 for no access.

## Review Focus

- Linking someone else's attachment id to my ใบลา is refused.
- A non-ASCII (Thai) file name survives upload and download headers.
- Resubmit without `attachmentId` keeps the file; `null` removes it.
- A scanner that accepts the connection but never answers fails closed by timeout.
- 10 MB + 1 byte is refused before scanning.

---

### Task 1: Schema and contracts
- [x] Failing tests: migrate test lists 0015; contracts accept `attachmentId` (uuid, nullable, optional) on leave and travel input.
- [x] Migration `0015_attachment_filename.sql`, Drizzle, migrate.ts, modules.md; contracts.
- [x] Commit `feat(db): keep the original name of an attachment`.

### Task 2: Core files
- [x] Failing tests: clamd scanner (fake TCP server: OK, FOUND, no answer, refused); AttachmentService stores after CLEAN, names FILE_INFECTED / SCAN_UNAVAILABLE, opens bytes only when authorized; S3 adapter and repository against SeaweedFS + MariaDB (integration, skipped without `S3_ENDPOINT`); access check for uploader, ใบลา viewer, trip viewer, outsider.
- [x] Implement `ClamdScanner`, `S3ObjectStorage`, `DatabaseAttachmentRepository`, `AttachmentAccess`, audit.
- [x] Commit `feat(files): scan, store and open private attachments`.

### Task 3: Link to ใบลา and trips
- [x] Failing integration tests: submit/resubmit with own attachment, someone else's (INVALID_ATTACHMENT), keep on omit, remove on null; detail returns `{ attachmentId, filename }`.
- [x] Implement in LeaveService, OfficialTravelService, queries.
- [x] Commit `feat(leave,travel): attach a file to a ใบลา or trip`.

### Task 4: Web
- [x] Failing tests: upload route codes (401, 503, 413, 415, 422, 201); download route headers and 404; AttachmentField uploads and reports the id; leave and travel forms send it; detail pages link it.
- [x] Implement.
- [x] Commit `feat(web): upload and download attachments on leave and travel`.

### Task 5: Local services
- [ ] Dev compose runs SeaweedFS S3 and ClamAV; runbook lines; env examples.
- [ ] Commit `chore(infra): local object storage and virus scanning`.

Verification: `pnpm lint && pnpm typecheck && pnpm test`, `DATABASE_URL=… S3_ENDPOINT=http://127.0.0.1:8333 … pnpm test:integration`, `node --test scripts/*.test.mjs`, compose tests, `git diff --check origin/main...HEAD`.
