# ไฟล์แนบส่วนตัว: object storage, scanning and two first uses

Status: approved by wasan ("เอาตามที่แนะนำ", 2026-10-27). File bytes live in S3-compatible object storage on the hospital's own server; MariaDB keeps only the facts about each file. Which storage product runs in staging and production is wasan's open choice (SeaweedFS recommended); the code speaks plain S3 so the choice changes only compose files.

## Vocabulary

- **ไฟล์แนบส่วนตัว** (CONTEXT.md): unchanged.
- **ลิงก์ดาวน์โหลดชั่วคราว** is retired: the storage endpoint is on the internal network, so the browser never gets a storage URL. Every download goes through `/api/attachments/<id>/download`, which checks access each time.

## Rules

1. Accepted: PDF, JPEG and PNG, 1 byte to 10 MB. The first bytes must match the type (already in `AttachmentService`).
2. Every file is scanned by ClamAV (`clamd`, INSTREAM over TCP) before it is stored. INFECTED is refused as FILE_INFECTED; a scanner that cannot be reached or times out (10 s) refuses as SCAN_UNAVAILABLE. Nothing is stored without a CLEAN result, and the result is written to `attachment_scan`.
3. Object keys are `attachments/<random uuid>`; the original file name is kept only in MariaDB (`attachment.original_filename`, new, migration 0015) for display and the download's file name.
4. Uploading is a step of its own: `POST /api/attachments` (multipart, field `file`) stores the file for the signed-in person and answers `{ attachmentId, filename, contentType, sizeBytes }`. A form then sends `attachmentId` with its record.
5. A record may link only a file the same person uploaded (`INVALID_ATTACHMENT` otherwise).
6. Who may download: the uploader; anyone who may see a ใบลา whose `attachment_id` is the file (`LeaveQueries.detail`); anyone who may see a trip whose `attachment_id` is the file (`OfficialTravelQueries.detail`). Everyone else gets 404, the same as a missing file.
7. Downloads answer the bytes with the stored content type, `Content-Disposition: attachment` with an RFC 5987 file name, `X-Content-Type-Options: nosniff` and `Cache-Control: private, no-store`.
8. Audit: `attachment.uploaded` `{ attachmentId, contentType, sizeBytes }` and `attachment.downloaded` `{ attachmentId }`. Never the file name or content.
9. When storage or the scanner is not configured, upload and download stay 503 `object_storage_not_configured`, and forms hide the file field (the old notes stay).

## First uses

- **ใบลา**: an optional ใบรับรองแพทย์ or other evidence on file and on edit of a returned ใบลา. Leaving `attachmentId` out on edit keeps the file; `null` removes it. The ใบลา page shows the file to those who may see the ใบลา. The "ส่งที่งาน HR" notice stays for ใบลา that need a certificate and have none.
- **ไปราชการ**: the หัวหน้าคณะ attaches the หนังสือเชิญ on filing or on edit of a returned trip, with the same keep/remove rule. The trip page shows it.

## Configuration

Web reads `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION` (default `us-east-1`), `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (each also as `*_FILE`), `CLAMD_HOST` and `CLAMD_PORT` (default 3310). Path-style requests. The bucket is created on first use if missing.

## Round 1 limits

- One file per record.
- No re-scan of stored files when signatures update.
- Files whose record was never filed are not cleaned up yet.
