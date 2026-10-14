# R0.5 HR Master Data and Import Design

**Status:** approved for implementation (R0.5 hardening, item 5)
**Date:** 2026-10-14
**Source:** code review finding P0-5 (HR data not usable), `docs/pilot/r0-master-data-sign-off.md`

## Purpose

ให้ HR ในฐานะ **เจ้าของข้อมูล** นำเข้า **ข้อมูลตั้งต้น** ของ **บุคลากร** และ **หน่วยงาน** จากไฟล์ CSV ได้เอง ตรวจทานได้ก่อนบันทึก และให้หน้าทะเบียนบุคลากรกับโครงสร้างหน่วยงานแสดงข้อมูลจริงตามสิทธิ์ เพื่อทำ HR master-data sign-off ของ R0 ได้

## Current behaviour

- ตาราง `person` มีแค่ id และเลขประจำตัวประชาชนที่เข้ารหัส ไม่มีชื่อ ตำแหน่งงาน หรือสถานะ
- ตาราง `organization` มีแค่ชื่อ ไม่มีรหัสหรือหน่วยงานแม่
- หน้า `hr/people` และ `hr/organizations` เป็นข้อความตัวอย่าง
- ไม่มีทางสร้างบุคลากรหรือหน่วยงานนอกจาก seed ของ E2E
- `NationalIdProtector.mask()` จัดรูปแบบเลขเต็ม 13 หลักโดยไม่ได้ปิดตัวเลขใดเลย ขัดกับ DESIGN.md ("ห้ามแสดงเลขบัตรประชาชนเต็มใน UI")

## Decisions

| เรื่อง | ทางเลือกที่ใช้ | เหตุผล |
|---|---|---|
| ข้อมูลบุคลากรที่เพิ่ม | `employee_code` (รหัสบุคลากร, unique), `display_name`, `position_title` (ตำแหน่งงาน), `employment_status` (`ACTIVE`/`INACTIVE`), `national_id_masked` | พอสำหรับระบุตัว แสดงในคำขอ และเลือกผู้อนุมัติ; คอลัมน์ใหม่เป็น NULL ได้เพื่อให้ migration เป็นแบบ additive แต่การนำเข้าบังคับกรอก |
| ข้อมูลหน่วยงานที่เพิ่ม | `code` (unique), `parent_id` | อ้างอิงข้ามไฟล์ด้วยรหัส และแสดงเป็นลำดับชั้นได้ |
| การปิดเลขประจำตัวประชาชน | แสดงเฉพาะ 3 หลักท้าย `X-XXXX-XXXXX-12-3`, เก็บผลไว้ใน `national_id_masked` ตอนนำเข้า | หน้ารายการไม่ต้องถอดรหัส จึงไม่ต้องให้ทุก request เข้าถึงกุญแจเข้ารหัส |
| รูปแบบไฟล์ | CSV UTF-8 (มีหรือไม่มี BOM) มีแถวหัวตาราง; ไฟล์หน่วยงาน `code,name,parent_code`; ไฟล์บุคลากร `employee_code,national_id,display_name,position_title,organization_code,manager_employee_code,effective_from,status` | Excel บันทึก "CSV UTF-8" ได้ ไม่ต้องเพิ่ม dependency อ่าน .xlsx; วันที่รับ `YYYY-MM-DD` หรือ `D/M/YYYY` และปี พ.ศ. (มากกว่า 2400) แปลงเป็น ค.ศ. ให้ เพราะ HR มักกรอกแบบนี้; `position_title`, `manager_employee_code`, `status` (ว่าง = `ACTIVE`) และ `parent_code` เว้นได้ |
| ขั้นตอน | `validate` (ตรวจอย่างเดียว คืนรายงาน) แล้วจึง `apply` ซึ่งตรวจซ้ำและบันทึกทั้งหมดใน transaction เดียว ถ้ามีแถวผิดแม้แถวเดียวจะไม่บันทึกเลย | HR เห็นข้อผิดพลาดทั้งหมดก่อน และข้อมูลไม่ค้างครึ่งทาง |
| นำเข้าซ้ำ | upsert ตามรหัส; บุคลากรเดิมที่ยังไม่มีรหัสแต่เลขประจำตัวประชาชนตรงกันจะได้รับรหัสจากไฟล์; คนที่มี `employee_code` เดิมแต่เลขประจำตัวประชาชนไม่ตรง หรือเลขตรงกับคนอื่น ถือเป็นแถวผิด | นำเข้าแก้ไขรอบถัดไปได้ โดยไม่สร้างคนซ้ำ |
| ประวัติการสังกัด | ถ้าหน่วยงานหรือผู้บังคับบัญชาเปลี่ยน ปิดรายการเดิมด้วย `effective_until = effective_from` ใหม่ แล้วเพิ่มรายการใหม่ (วันที่ใหม่ต้องหลังวันที่ของรายการเดิม); ถ้าเหมือนเดิมไม่แก้ | รักษา **ประวัติการสังกัด** ตาม CONTEXT.md และไม่กระทบ **ภาพผู้อนุมัติ ณ เวลายื่น** ของคำขอเดิม |
| ขนาด | ไม่เกิน 2 MB และ 5,000 แถวต่อไฟล์ | เกินจำนวนบุคลากรของโรงพยาบาลชุมชนหลายเท่า และกันการใช้หน่วยความจำเกิน |
| สิทธิ์นำเข้า | `hr.person.manage` ระดับทั้งโรงพยาบาล (บทบาทที่ไม่ผูกหน่วยงาน) และเป็นเจ้าของข้อมูลโมดูล `hr` ระดับทั้งโรงพยาบาล (`data_owner_assignment.organization_id` เป็น NULL) | การนำเข้ากระทบทุกหน่วยงาน |
| สิทธิ์ดูรายการ | `hr.person.read`; บทบาทระดับโรงพยาบาลเห็นทุกคน, บทบาทที่ผูกหน่วยงานเห็นเฉพาะบุคลากรที่สังกัดหน่วยงานนั้นอยู่ปัจจุบัน | ตรงกับ `AuthorizationService` ที่ตรวจขอบเขตหน่วยงานแบบตรงตัว |
| บันทึกการตรวจสอบ | `hr.master_data.imported` ผล `SUCCESS` พร้อมจำนวนที่สร้าง/แก้ไขเท่านั้น อยู่ใน transaction เดียวกับข้อมูล; การ validate ไม่บันทึก | ไม่มีเลขประจำตัวประชาชนหรือชื่อใน metadata |
| รายงานข้อผิดพลาด | ไฟล์ แถว คอลัมน์ และรหัสข้อผิดพลาด ไม่ส่งค่าที่ผิดกลับ | กันเลขประจำตัวประชาชนรั่วผ่าน response หรือ log |
| กุญแจเข้ารหัส | `NATIONAL_ID_ENCRYPTION_KEY` และ `NATIONAL_ID_LOOKUP_KEY` (hex 32 ไบต์) อ่านผ่าน `*_FILE` เป็น Docker secret | ตามรูปแบบ secret เดิม; ถ้าไม่มีกุญแจ การนำเข้าตอบ 503 |

## Components and interfaces

- `packages/db/migrations/0004_hr_master_data.sql` และ Drizzle schema ใน `schema/hr.ts`, `schema/core.ts`
- `packages/core/src/hr/csv.ts`: `parseCsv(text)` รองรับ quote, `""`, CRLF และ BOM
- `packages/core/src/hr/master-data-validation.ts`: `validateMasterData(files, existing, lookup)` คืน `{ organizations, people, errors }` โดยไม่แตะ DB
- `packages/core/src/hr/master-data-import.ts`
  - `MasterDataImportService.validate(files)` / `.apply(files, actorPersonId)` อ่านข้อมูลเดิม ตรวจ แล้วเขียนใน transaction
- `packages/core/src/hr/hr-directory.ts`: `HrDirectory.listPeople(scope)` และ `.listOrganizations()`
- `apps/web/src/app/api/hr/imports/route.ts`: `POST` multipart (`organizations`, `people`, `mode`)
- หน้า `hr/people` และ `hr/organizations` อ่านข้อมูลจริง; หน้า `hr/imports` มีฟอร์มตรวจและนำเข้า (เมนูแสดงเฉพาะ `hr-manager`)

## Error codes

`INVALID_CSV`, `MISSING_COLUMN`, `REQUIRED`, `TOO_LONG`, `INVALID_NATIONAL_ID`, `INVALID_DATE`, `INVALID_STATUS`, `DUPLICATE_CODE`, `DUPLICATE_NATIONAL_ID`, `NATIONAL_ID_CONFLICT`, `UNKNOWN_ORGANIZATION`, `UNKNOWN_MANAGER`, `SELF_MANAGER`, `PARENT_CYCLE`, `EFFECTIVE_DATE_NOT_AFTER_CURRENT`, `TOO_MANY_ROWS`, `FILE_TOO_LARGE`

## Out of scope

- หน้าแก้ไขบุคลากรรายคน, การนำเข้า site/location และบัญชีผู้ใช้
- การเห็นข้อมูลของหน่วยงานลูกตามลำดับชั้น (ขอบเขตยังตรวจแบบตรงตัว)
- การหมุนกุญแจเข้ารหัสเลขประจำตัวประชาชน

## Verification

- unit: CSV parser, ทุก error code, upsert ซ้ำ, ประวัติการสังกัด, mask, ไม่มีเลขประจำตัวประชาชนใน report หรือ audit
- integration (MariaDB): migration 0004, apply แล้ว apply ซ้ำได้ผลเดิม, แถวผิดไม่บันทึกอะไร, รายการตามขอบเขตหน่วยงาน
- web: route ตอบ 401/403/413/422/200, หน้ารายการแสดงเลขที่ปิดแล้วเท่านั้น
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration`
