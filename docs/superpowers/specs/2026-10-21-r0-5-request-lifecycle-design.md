# R0.5 Request Lifecycle Completion Design

**Status:** draft for review
**Date:** 2026-10-21
**Source:** code review finding P1-1 (workflow incomplete), the request detail page still showing "ตัวอย่างบุคลากร", and the lifecycle in `2026-09-30-waritch-hospital-back-office-design.md` (Workflow section)

## Purpose

ให้ **คำขอ** เดินครบวงจรตามที่ออกแบบไว้: ผู้อนุมัติ "ไม่อนุมัติ" และ "ส่งกลับแก้ไข" ได้จากหน้าจอ, ผู้ขอยกเลิกคำขอและส่งคำขอที่ถูกส่งกลับเข้าพิจารณาใหม่ได้, และทุกคนเห็นว่าใครเป็นผู้ขอและใครตัดสินอะไรด้วยเหตุผลใด

## Current behaviour

- หน้ารายละเอียดมีแค่ปุ่ม "อนุมัติคำขอ" แม้ API จะรองรับ `REJECT` และ `RETURN` (บังคับเหตุผลแล้ว)
- ไม่มีการยกเลิก และคำขอที่ `RETURNED` ทำอะไรต่อไม่ได้
- ผู้ขอแสดงเป็น "ตัวอย่างบุคลากร" เสมอ และไม่มีประวัติการพิจารณาหรือเหตุผลให้ผู้ขอเห็น
- เมื่อขั้นหนึ่ง `REJECT`/`RETURN` ขั้นถัดไปของสายอนุมัติยังค้างเป็น `PENDING`
- `StatusBadge` รู้จัก 4 สถานะ และ CSS มีสีให้แค่ 2 สถานะ
- `approval_step.sequence` เป็น `VARCHAR` และหน้ารายละเอียดเรียงด้วย SQL `ORDER BY sequence` ซึ่งจะเรียง "10" ก่อน "2"

## Scope

ทำในรอบนี้: ปุ่มไม่อนุมัติ/ส่งกลับพร้อมเหตุผล, ยกเลิก, ส่งใหม่หลังถูกส่งกลับ, ชื่อผู้ขอจริง, ประวัติการพิจารณา, สถานะครบทุกค่า

ไม่ทำในรอบนี้ (แยก spec): เนื้อหาคำขอ (หัวข้อ รายละเอียด สถานที่) และ `DRAFT`, กล่องงานรอพิจารณาของผู้อนุมัติ, ผู้แทนเปิดดูคำขอ, สายอนุมัติหลายขั้นตามชนิดคำขอ, การประกาศผลประโยชน์ทับซ้อน

## Decisions

| เรื่อง | ทางเลือกที่ใช้ | เหตุผล |
|---|---|---|
| การยกเลิก | ผู้ขอเท่านั้น ยกเลิกได้เมื่อสถานะ `IN_REVIEW` หรือ `RETURNED` และต้องใส่เหตุผล; ผลคือ `CANCELLED` | ตรงกับ spec หลัก ("เก็บผู้กระทำ เวลา เหตุผล"); หลัง `APPROVED` ให้แต่ละโมดูลกำหนดเองภายหลัง |
| ที่เก็บเหตุผลการยกเลิก | ตารางใหม่ `request_cancellation (id, request_id, actor_person_id, reason, created_at)` | การยกเลิกไม่ใช่การตัดสินของขั้นอนุมัติ; ห้ามเก็บเหตุผลใน audit metadata, notification หรือ outbox ตาม CLAUDE.md |
| ส่งใหม่หลังถูกส่งกลับ | ผู้ขอกด "ส่งพิจารณาอีกครั้ง" ได้เมื่อ `RETURNED`; ระบบหาผู้อนุมัติใหม่ ณ เวลาส่ง เพิ่มขั้นใหม่ต่อท้าย (sequence ถัดไป) แล้วกลับเป็น `IN_REVIEW` | การส่งใหม่คือการยื่นครั้งใหม่ จึงตรึง **ภาพผู้อนุมัติ ณ เวลายื่น** ใหม่; ขั้นเดิมคงไว้เป็นประวัติ |
| ขั้นที่ค้างหลังปิดรอบ | เมื่อ `REJECT`, `RETURN` หรือยกเลิก ขั้น `PENDING` ที่เหลือของรอบนั้นเปลี่ยนเป็น `CANCELLED` | ไม่ให้ขั้นเก่าถูกเลือกเป็นผู้อนุมัติหลังส่งใหม่ |
| การเรียงขั้น | เรียงด้วย `CAST(sequence AS UNSIGNED)` ใน SQL และ `Number()` ในโค้ด | แก้การเรียงแบบข้อความโดยไม่ต้องเปลี่ยนชนิดคอลัมน์ |
| ปุ่มของผู้อนุมัติ | "อนุมัติ", "ไม่อนุมัติ", "ส่งกลับแก้ไข"; สองปุ่มหลังเปิดช่องเหตุผล (บังคับ, ไม่เกิน 2,000 ตัวอักษร) แล้วกด "ยืนยัน" | ไม่ใช้ browser prompt ตาม DESIGN.md; การกระทำที่ปิดคำขอแยกด้วย intent ไม่ใช่ตำแหน่งอย่างเดียว |
| ชื่อในหน้ารายละเอียด | `person.display_name` ของผู้ขอและผู้ตัดสิน; ถ้าไม่มีใช้ `employee_code`; ถ้าไม่มีทั้งคู่ "ไม่ระบุ" | ใช้ข้อมูลจากการนำเข้า HR; ไม่แสดงเลขประจำตัวประชาชน |
| ประวัติการพิจารณา | แสดงทุกการตัดสินและการยกเลิก: เวลา (Asia/Bangkok), ผู้กระทำ, ผล, เหตุผล | ผู้ขอต้องรู้ว่าทำไมถูกส่งกลับจึงแก้ไขได้; เห็นได้เฉพาะคนที่เปิดคำขอได้อยู่แล้ว |
| การแจ้งเตือน | ยกเลิก: แจ้งผู้อนุมัติที่รออยู่ ("คำขอถูกยกเลิก"); ส่งใหม่: แจ้งผู้อนุมัติขั้นแรกของรอบใหม่ ("มีคำขอรอพิจารณา") | ข้อความไม่มีเหตุผลหรือข้อมูลอ่อนไหว |
| เหตุการณ์และบันทึกการตรวจสอบ | outbox `workflow.request.cancelled`, `workflow.request.resubmitted`; audit action เดียวกัน ผล `SUCCESS`; เขียนใน transaction เดียวกับการเปลี่ยนสถานะ | ตามกติกา workflow + audit + outbox ใน transaction เดียว |
| ความพร้อมกัน | ทุกการเปลี่ยนสถานะล็อกแถวคำขอด้วย `SELECT ... FOR UPDATE` ก่อนตรวจสถานะ | กันยกเลิกกับอนุมัติชนกัน |

## Lifecycle

```
IN_REVIEW --APPROVE (ขั้นสุดท้าย)--> APPROVED
IN_REVIEW --APPROVE (มีขั้นถัดไป)--> IN_REVIEW
IN_REVIEW --REJECT--> REJECTED
IN_REVIEW --RETURN--> RETURNED --resubmit--> IN_REVIEW
IN_REVIEW --cancel (ผู้ขอ)--> CANCELLED
RETURNED  --cancel (ผู้ขอ)--> CANCELLED
```

## Components and interfaces

- `packages/db/migrations/0005_request_cancellation.sql` และ Drizzle schema
- `packages/core/src/workflow/request-service.ts`
  - `cancelRequest({ requestId, actorPersonId, reason })` คืนคำขอที่ปิดแล้ว; error `REQUEST_NOT_FOUND`, `NOT_REQUESTOR`, `REQUEST_NOT_CANCELLABLE`, `REASON_REQUIRED`
  - `resubmitRequest({ requestId, actorPersonId })`; error `NOT_REQUESTOR`, `REQUEST_NOT_RETURNED`, `NO_APPROVER`
- `ApprovalService.decideRequest` ปิดขั้น `PENDING` ที่เหลือเมื่อ `REJECT`/`RETURN`
- `WorkflowRepository` เพิ่ม `saveCancellation`; `DatabaseWorkflowRepository` เรียงขั้นด้วย `CAST`
- `packages/core/src/workflow/request-history.ts`: `RequestHistory.load(requestId)` คืนผู้ขอ หน่วยงาน และรายการประวัติพร้อมชื่อ (ใช้กับหน้ารายละเอียด)
- `apps/web`: `POST /api/requests/[id]/cancellation`, `POST /api/requests/[id]/resubmission`; ปุ่มและฟอร์มเหตุผลใน `request-detail-panel`; `StatusBadge` ครบทุกสถานะพร้อม CSS; หน้า audit แสดง action ใหม่

## Error handling

- API ตอบ 401 เมื่อไม่ได้ login, 404 เมื่อคำขอไม่มีหรือผู้เรียกไม่ใช่ผู้ขอ (เหมือนหน้ารายละเอียด ไม่บอกว่ามีคำขอนั้นอยู่), 409 เมื่อสถานะไม่อนุญาต, 422 เมื่อไม่มีเหตุผลหรือไม่พบผู้อนุมัติ, 503 เมื่อฐานข้อมูลใช้ไม่ได้
- UI แสดงข้อความไทยตามรหัส และไม่เปลี่ยนสถานะบนหน้าจอจนกว่า API ตอบสำเร็จ
- log มีแค่รหัสข้อผิดพลาด ไม่มีเหตุผล

## Verification

- unit (core): ยกเลิกได้/ไม่ได้ตามสถานะและผู้กระทำ, ส่งใหม่สร้างขั้นใหม่และแจ้งผู้อนุมัติ, `REJECT`/`RETURN` ปิดขั้นที่เหลือ, ไม่มีเหตุผลใน audit/outbox/notification
- integration (MariaDB): ยกเลิกและส่งใหม่เขียนสถานะ ขั้น outbox และ audit ใน transaction เดียว, การเรียงขั้นเมื่อมีมากกว่า 9 ขั้น, ประวัติพร้อมชื่อ
- web: route ตอบ 401/404/409/422/200, ปุ่มแสดงตามบทบาทและสถานะ, ฟอร์มเหตุผลบังคับกรอก, หน้ารายละเอียดแสดงชื่อจริงและประวัติ
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration`, `bash infra/backup/restore-verify.test.sh`, `git diff --check`, `next build`
