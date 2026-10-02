# R0 Workflow Audit Design

## Purpose

ทำให้โครงการนำร่อง R0 ตรวจสอบย้อนกลับการสร้างคำขอและการพิจารณาคำขอได้จากหน้า `/audit` โดยไม่บันทึกข้อมูลลับหรือขยายสิทธิ์การมองเห็นเกินผู้เกี่ยวข้องกับคำขอ

## Scope

อยู่ในขอบเขตเฉพาะโมดูล `maintenance` และคำขอที่มีอยู่แล้วใน R0:

- บันทึกเมื่อผู้ใช้สร้างคำขอสำเร็จ
- บันทึกเมื่อผู้มีอำนาจอนุมัติ ปฏิเสธ หรือส่งกลับคำขอสำเร็จ
- แสดงรายการ audit แบบอ่านอย่างเดียวของผู้ใช้ที่เข้าสู่ระบบ
- ทดสอบ transaction, redaction และ data scope

ไม่รวมการค้นหา/filter, export, audit การอ่านข้อมูล, สิทธิ์ผู้ตรวจสอบส่วนกลาง, หรือการแก้ไข audit ย้อนหลัง

## Event Model

`RequestService` และ `ApprovalService` เป็นจุดควบคุมการบันทึก audit เพราะเป็นเจ้าของ business transition ของคำขอ ไม่ให้ API route ต้องรับผิดชอบการบันทึกเอง

การสร้างคำขอจะเพิ่ม audit event `workflow.request.submitted`; การตัดสินใจจะเพิ่ม `workflow.request.decided` พร้อมผล `APPROVE`, `REJECT` หรือ `RETURN` ตามการตัดสินใจที่บันทึกสำเร็จ. แต่ละ event ใช้ `request` เป็น target และระบุ actor จากบุคลากรผู้ยื่นหรือผู้ตัดสินใจ

metadata อนุญาตเพียง `moduleCode`, `requestReference`, `status` และ `organizationId`. ให้ใช้ `AuditService` เดิมเพื่อ validate และ redact ก่อน persist; ห้ามเก็บรหัสผ่าน, token, เลขประจำตัวประชาชน, เหตุผลอิสระของผู้พิจารณา หรือ snapshot ที่อาจมีข้อมูลเกินจำเป็น

## Transaction and Failure Semantics

`WorkflowRepository` จะรองรับการ append audit event ใน transaction เดียวกับการบันทึก request, approval step, decision และ outbox event. หาก append audit ล้มเหลว transaction ทั้งหมดต้อง rollback; API ไม่ตอบว่าสร้าง/ตัดสินสำเร็จ

Audit เป็น append-only สำหรับ application: R0 ไม่มี endpoint หรือ repository operation สำหรับ update/delete event ที่บันทึกแล้ว. การเปลี่ยนแปลง workflow สำเร็จหนึ่งครั้งต้องมี event ตรงกันหนึ่งรายการ และ retry ที่ถูกป้องกันด้วย workflow constraints ต้องไม่สร้าง event ซ้ำ

## Read Model and Access Control

หน้า `/audit` query จาก `audit_event` โดยใช้ session ฝั่ง server และเรียง `created_at` ใหม่ไปเก่า. R0 แสดงเฉพาะ event ที่ `actor_person_id` ตรงกับ `session.personId`:

- ผู้ยื่นเห็นการสร้างคำขอของตนเอง
- ผู้พิจารณาเห็นการตัดสินใจที่ตนบันทึก

แต่ละแถวแสดงเวลา, การกระทำที่เป็นภาษาไทย, เลขอ้างอิงคำขอ และผลลัพธ์. `target_id`, UUID ของบุคลากร, raw metadata และข้อมูลอ่อนไหวจะไม่แสดงใน UI. ไม่มี session จะถูก redirect ตามกลไก protected route เดิม และไม่มี endpoint ใหม่ที่เปิด audit ออกสู่สาธารณะ

## Components and Interfaces

- `packages/contracts`: ใช้ `AuditInput`/`AuditEvent` เดิม; เพิ่มเฉพาะชนิดที่จำเป็นหาก workflow repository ต้องรับ event โดยไม่ทำให้ UI ผูกกับ schema ฐานข้อมูล
- `packages/core/workflow`: inject audit recorder/repository ที่ transaction-aware เข้า `RequestService` และ `ApprovalService`
- `packages/core/workflow/database-workflow-repository.ts`: persist `audit_event` โดย UTC และภายใน transaction เดิม
- `apps/web/src/app/api/requests/*`: สร้าง service พร้อม database workflow repository ที่รองรับ audit; API ยังคืน response/error semantics เดิม
- `apps/web/src/app/(app)/audit/page.tsx`: แทน placeholder ด้วย server-rendered table
- `packages/i18n`: เพิ่ม label/action/result ที่ภาษาไทยต้องใช้

## Testing and Verification

- Unit tests: request submission และ each decision persist event ที่มี action/result/actor/target ถูกต้อง
- Integration test MariaDB: request, approval decision, outbox และ audit อยู่ใน transaction เดียวกัน; failure ของ audit ทำให้ workflow ไม่ถูกบันทึก
- Audit service tests: metadata ที่ไม่อยู่ใน allowlist หรือเป็นข้อมูลต้องห้ามไม่ถูกเก็บ
- Web tests: หน้า audit render แถวของ actor ปัจจุบันเท่านั้น และแสดง empty state เมื่อไม่มีรายการ
- ก่อน commit: `pnpm test`, `pnpm typecheck`, `pnpm lint`, web production build และ `git diff --check`
- ก่อนประกาศ staging: deploy เฉพาะ `web`, ตรวจ `/api/health`, แล้วทำ browser smoke test สร้างคำขอและอนุมัติด้วยบัญชีแยกกันเพื่อยืนยัน audit ของแต่ละ actor

## Risks and Decisions

- การทำ audit เป็นส่วนหนึ่งของ transaction เพิ่มความเข้มงวด: database problem จะหยุด workflow แทนการมีสถานะที่ไม่มีหลักฐาน ซึ่งเป็น trade-off ที่ตั้งใจเลือกสำหรับ pilot
- R0 จงใจจำกัด visibility ตาม actor. การเพิ่ม auditor/admin view ภายหลังต้องมี permission และ policy แยก ไม่ควรใช้การ query ตรงจาก UI
- `approval_decision.reason` ไม่ส่งเข้า metadata แม้ API รองรับ เพื่อไม่เพิ่มความเสี่ยงเก็บข้อความที่อาจมีข้อมูลส่วนบุคคล
