# R0.5 Restore Verification and Worker Resilience Design

**Status:** approved for implementation (R0.5 hardening, item 1–2)
**Date:** 2026-10-14
**Source:** code review `R0.5 Hardening` findings P0-2 and P0-4

## Purpose

ปิด blocker สองข้อของ R0 pilot gate ที่ไม่ต้องรอการตัดสินใจทางธุรกิจ:

1. restore drill ต้องตรวจตารางที่มีอยู่จริง และ test ต้องจับได้เมื่อสคริปต์อ้างตารางที่ migration ไม่ได้สร้าง
2. worker ต้องไม่ล่มทั้ง process เมื่อ outbox event หนึ่งรายการประมวลผลไม่สำเร็จ และ event ที่ดีด้านหลังต้องถูกส่งต่อได้

## Current behaviour

- `infra/backup/restore-verify.sh` query `foundation_person` ซึ่งไม่มีในทุก migration (ตารางจริงคือ `person`) จึงล้มเหลวทุกครั้ง ส่วน `restore-verify.test.sh` แค่ grep คำในสคริปต์จึงผ่าน
- `createWorkerRuntime` เรียก `void publish()` โดยไม่จับ error; `OutboxConsumer` หยุดทั้ง batch ที่ event แรกที่ throw ผลคือ unhandled rejection, process ปิด, Docker restart แล้วเจอ event เดิมซ้ำ (อาการเดียวกับ hotfix 2026-10-02)

## Design

### Restore verification

- สคริปต์ประกาศรายการตารางที่ต้องตรวจในบรรทัดเดียว `required_tables=(...)`: `schema_migration person organization request approval_step audit_event outbox_event notification`
- ทุกตารางต้อง query `COUNT(*)` ได้และได้ตัวเลข; ผลลัพธ์พิมพ์เป็น `table=count` ไม่พิมพ์ข้อมูลแถว
- `schema_migration` ต้องมีทุก version ที่ `packages/db/src/migrate.ts` ประกาศ เพื่อยืนยันว่า backup มาจาก schema ล่าสุด
- `restore-verify.test.sh` อ่าน `required_tables` จากสคริปต์ และยืนยันว่าแต่ละตารางถูกสร้างด้วย `CREATE TABLE IF NOT EXISTS <name>` ใน `packages/db/migrations/*.sql` หรือ `migrate.ts` จึงจับการอ้างชื่อตารางผิดได้โดยไม่ต้องใช้ Docker

### Worker failure handling

- migration ใหม่ `0002_outbox_retry.sql` เพิ่มคอลัมน์ใน `outbox_event` แบบ additive: `attempts INT NOT NULL DEFAULT 0`, `last_error VARCHAR(64) NULL`, `next_attempt_at DATETIME NULL`, `dead_lettered_at DATETIME NULL`
- `pending()` เลือกเฉพาะ event ที่ยังไม่ processed, ไม่ dead-letter และถึงเวลา retry แล้ว
- `OutboxConsumer` จับ error ต่อ event: เรียก `markFailed(eventId, code)` แล้วไปต่อ event ถัดไป คืน `{ published, failed }`
- `markFailed` เพิ่ม `attempts`, ตั้ง `next_attempt_at` แบบ exponential backoff (30 วินาที × 2^attempts สูงสุด 1 ชั่วโมง) และตั้ง `dead_lettered_at` เมื่อครบ 5 ครั้ง
- `last_error` เก็บเฉพาะ error code รูปแบบ `UPPER_SNAKE_CASE` (เช่น `INVALID_NOTIFICATION_EVENT`) ข้อความอื่นแทนด้วย `UNEXPECTED_ERROR` เพื่อไม่ให้ payload หรือข้อมูลอ่อนไหวหลุดเข้า DB หรือ log
- log ต่อ event ที่ล้มเหลวมีเฉพาะ `eventId`, `type`, `code`
- `createWorkerRuntime` จับ error ของทั้ง batch (เช่น DB ล่ม) ส่งให้ `onError` แล้วรอรอบถัดไป ไม่ปิด process
- payload JSON ที่ parse ไม่ได้จะถูกส่งต่อเป็น payload ว่าง เพื่อให้ consumer ปฏิเสธและถูก mark failed แทนการทำให้ทั้ง batch ล้ม

## Out of scope

- metric/alert ของ queue backlog และ dead-letter (ทำในงาน monitoring ของ R0.5)
- หน้าจอหรือเครื่องมือ replay dead-letter; ผู้ดูแลระบบแก้ได้ด้วย SQL ตาม runbook
- การเปลี่ยน filter ชนิด event ของ worker (ยังรับเฉพาะ `notification.*`)

## Verification

- unit test: event แรกล้มแต่ event ที่สองยังถูกส่งและ mark processed; error code ถูก sanitize; runtime ไม่ throw เมื่อ batch ล้ม
- unit test: repository SQL กรอง dead-letter/next_attempt_at และ markFailed ใช้ backoff + เพดาน 5 ครั้ง
- migration test: `0002_outbox_retry.sql` ถูกบันทึก version
- `bash infra/backup/restore-verify.test.sh` ล้มเมื่อใส่ชื่อตารางที่ไม่มีอยู่
- `pnpm lint && pnpm typecheck && pnpm test`
