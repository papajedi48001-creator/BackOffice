# Module Launcher and Module Registry Design

**Status:** draft for review
**Date:** 2026-10-21
**Source:** ผู้ใช้ขอให้หน้าหลักเป็นปุ่มไอคอนแยกตามโมดูล ดูทันสมัยและเป็นมืออาชีพ (2026-10-21) และให้เธรด "รีวิวโค้ด BackOffice" เป็นจุดเชื่อมโมดูลที่พัฒนาแยกเธรด ภาพตัวอย่างที่ผู้ใช้เลือก ("แสดงทั้งหมด"): `/mnt/project-files/screenshots/2026-10-21/launcher-desktop.png`, `launcher-mobile.png`

## Purpose

หน้าหลัก (`/dashboard`) เป็นจุดเข้าเดียวของทุกโมดูล: ผู้ใช้เห็นงานที่รอตนเอง แล้วกดเข้าโมดูลที่มีสิทธิ์ได้ทันที โมดูลใหม่ที่พัฒนาในเธรดของตัวเองเสียบเข้าหน้าหลักและเมนูด้านซ้ายได้ด้วยการเพิ่มรายการเดียว โดยไม่ต้องแก้ layout

## Current behaviour

- `/dashboard` มีกล่องตัวเลข "รอพิจารณา" และ "การแจ้งเตือน" เป็น 0 ตายตัว
- เมนูด้านซ้ายประกอบใน `(app)/layout.tsx` ด้วย `splice` ตามชื่อบทบาท ทุกโมดูลใหม่ต้องแก้ไฟล์นี้ (ชนกันง่ายเมื่อหลายเธรดทำพร้อมกัน)
- ปุ่ม "เข้าสู่ระบบ" ไม่มีสไตล์
- เมนูไม่บอกว่ากำลังอยู่หน้าไหน

## Decisions

| เรื่อง | ทางเลือกที่ใช้ | เหตุผล |
|---|---|---|
| ที่เก็บรายการโมดูล | `apps/web/src/lib/modules.ts` ส่งออก `moduleRegistry: ModuleEntry[]` ไฟล์เดียว ทั้งหน้าหลักและเมนูอ่านจากที่นี่ | เธรดโมดูลเพิ่มแค่รายการของตัวเอง; ลำดับในไฟล์คือลำดับที่แสดง |
| รูปแบบรายการ | `{ code, href, labelKey, descriptionKey, icon, group, status: 'live' \| 'planned', visible(subject) }` | `visible` รับ `AccessSubject` จาก session ตัดสินบนเซิร์ฟเวอร์; `planned` ไม่มีลิงก์ |
| กลุ่มบนหน้าหลัก | `mine` งานของฉัน, `people` บุคลากรและองค์กร, `services` งานบริการ, `governance` ความปลอดภัยและการตรวจสอบ, แล้วกลุ่ม "โมดูลที่กำลังพัฒนา" รวม `planned` ทั้งหมดไว้ท้ายสุด | โมดูลบริการ (จองห้อง งานซ่อม ฯลฯ) ย้ายจากกลุ่มท้ายไป `services` เมื่อเปลี่ยนเป็น `live`; กลุ่มที่ไม่มีรายการที่มองเห็นไม่แสดงหัวข้อ |
| โมดูลที่กำลังพัฒนา | แสดงทั้งหมดเป็นปุ่มจาง ขอบประ ป้าย "เร็ว ๆ นี้" ไม่ใช่ลิงก์ (`aria-disabled` บนองค์ประกอบที่ไม่ใช่ปุ่ม) ไม่แสดงในเมนูด้านซ้าย | ผู้ใช้เลือก "แสดงทั้งหมด"; ห้าม clickable div ตาม DESIGN.md |
| รายการเริ่มต้น | live: คำขอ, การแจ้งเตือน, ทะเบียนบุคลากร, โครงสร้างหน่วยงาน, นำเข้าข้อมูลตั้งต้น, บทบาทและสิทธิ์, ผู้แทน, บันทึกการตรวจสอบ; planned: จองห้องประชุม, งานซ่อม, พัสดุ, ยานพาหนะ, ลงเวลาปฏิบัติงาน, การลา, ทะเบียนทรัพย์สิน, ศูนย์คอมพิวเตอร์, แผนงานและโครงการ, ผู้บริจาค | ตามโมดูลในแผนแม่บท `2026-09-30-waritch-hospital-back-office-design.md` |
| สิทธิ์การมองเห็น | ใช้กติกาเดิมของเมนูทุกข้อ: บุคลากร/หน่วยงานเมื่อมี `hr-reader` หรือ `hr-manager`, นำเข้าเมื่อ `canActHospitalWide(subject, 'hr.person.manage', 'hr')`, บทบาทและผู้แทนเมื่อ `hr-manager`, ที่เหลือทุกคนที่เข้าระบบ | ไม่เปลี่ยนว่าใครเห็นอะไร; หน้าและ API ยังตรวจสิทธิ์เองทุกครั้ง การซ่อนปุ่มไม่ใช่การกันสิทธิ์ |
| ตัวเลขบนหน้าหลัก | "คำขอรอพิจารณา" = จำนวนคำขอ `IN_REVIEW` ที่ขั้น `PENDING` ลำดับต่ำสุดมอบให้ผู้ใช้ (`JSON_VALUE(assignee_snapshot, '$.personId')`, เรียงด้วย `CAST(sequence AS UNSIGNED)`); "การแจ้งเตือนยังไม่อ่าน" = notification `in_app` ของผู้ใช้ที่ `read_at IS NULL`; ตัวเลขเป็นลิงก์ไป `/requests` และ `/notifications` และแสดงเป็นป้ายบนปุ่มโมดูลเดียวกัน | นับเฉพาะของผู้ใช้จาก session; ถ้าฐานข้อมูลใช้ไม่ได้แสดง "–" ไม่ใช่ 0 |
| ป้ายตัวเลขของโมดูลอื่น | `ModuleEntry.badge?: (db, subject) => Promise<number>` ไม่บังคับ; หน้าหลักเรียกพร้อมกัน ถ้าอันใดล้มให้ป้ายนั้นหายไป หน้าไม่ล้ม | โมดูลจองห้องเพิ่มจำนวน "รออนุมัติ" ของตัวเองได้ภายหลังโดยไม่แก้หน้าหลัก |
| ส่วนหัว | "สวัสดี <ชื่อ>" จาก `person.display_name` (ไม่เติม "คุณ" เพราะชื่อจาก HR มีคำนำหน้าแล้ว) (ไม่มีให้ใช้ "สวัสดี"), วันที่แบบไทย พ.ศ. ตาม Asia/Bangkok, หน่วยงานหลักของผู้ใช้ถ้ามี | ใช้ข้อมูลที่นำเข้าจาก HR แล้ว |
| ไอคอน | SVG แบบเส้นเขียนไว้ใน `apps/web/src/components/module-icon.tsx` (ไม่ใช้ไลบรารีหรือ CDN) `aria-hidden` และมีชื่อโมดูลเป็นข้อความเสมอ | ไม่เพิ่ม dependency; ไม่สื่อด้วยไอคอนอย่างเดียว |
| เมนูด้านซ้าย | สร้างจาก registry (เฉพาะ `live` ที่มองเห็น) เพิ่ม `aria-current="page"` และแถบสีบนรายการที่เปิดอยู่ | layout ไม่ต้องรู้จักโมดูล |
| DESIGN.md | เพิ่มข้อยกเว้น: หน้าหลักใช้ตารางปุ่มโมดูลได้ (ขอบเส้น เงาเบาเฉพาะตอน hover ไม่มี gradient) หน้าทำงานอื่นยังไม่ใช้ card จำนวนมาก | ให้กติกาออกแบบตรงกับหน้าจอจริง |
| ปุ่มเข้าสู่ระบบ | ใช้สไตล์ปุ่มหลักเดียวกับปุ่มอื่น (สี hospital-blue, สูงอย่างน้อย 44px, focus ring) | หน้าแรกดูเป็นระบบเดียวกัน |
| การแจ้งเตือนกลาง | ทุกโมดูลแจ้งผู้ใช้ผ่านศูนย์การแจ้งเตือนกลางเท่านั้น: เขียน outbox `notification.in_app` ใน transaction เดียวกับการเปลี่ยนสถานะ payload เพิ่ม `moduleCode` (รหัสเดียวกับ registry); worker เก็บลงคอลัมน์ใหม่ `notification.module_code` (migration `0006_notification_module.sql`, NULL ได้); หน้าการแจ้งเตือนแสดง `[ชื่อโมดูล] หัวข้อ` เช่น "[จองห้องประชุม] การจองได้รับการอนุมัติ" โดยชื่อมาจาก `labelKey` ใน registry; แถวเดิมที่ไม่มี `module_code` ถือเป็น `requests` | ผู้ใช้เห็นทุกเรื่องในกล่องเดียวและรู้ว่ามาจากโมดูลไหน; ชื่อโมดูลไม่ถูกเก็บซ้ำใน subject จึงเปลี่ยนชื่อได้ที่เดียว; `moduleCode` ไม่บังคับใน schema เพื่อไม่ทำให้ event เก่าใน outbox ล้ม แต่กติกาการเชื่อมบังคับให้โมดูลใหม่ส่ง |
| กติกาเชื่อมโมดูล | `docs/integration/modules.md` อธิบายวิธีเสียบโมดูลใหม่: รายการใน registry, เลข migration, permission, การแจ้งเตือน, audit action, ศัพท์ใน CONTEXT.md | เธรดโมดูลทำตามเอกสารเดียวกัน เธรดนี้เป็นผู้ดูแลเอกสาร |

## Components and interfaces

- `apps/web/src/lib/modules.ts`: `ModuleEntry`, `moduleRegistry`, `visibleModules(subject)`, `navigationFor(subject)` (คืน `NavigationItem[]`)
- `apps/web/src/components/module-icon.tsx`: `<ModuleIcon name>` ชุดไอคอนตามรายการเริ่มต้น
- `apps/web/src/components/module-launcher.tsx`: แสดงกลุ่มและปุ่ม รับรายการที่คัดแล้วและตัวเลขป้าย (ไม่อ่านฐานข้อมูลเอง)
- `apps/web/src/lib/dashboard-summary.ts`: `loadDashboardSummary(db, personId)` คืน `{ pendingApprovals, unreadNotifications, displayName, organizationName }`
- `(app)/dashboard/page.tsx`: อ่าน session, summary และ badge แล้วส่งให้ launcher
- `(app)/layout.tsx` และ `components/app-shell.tsx`: ใช้ `navigationFor`; ตัวนับแจ้งเตือนในเมนูคงเดิม
- `packages/i18n/src/th.ts`: ชื่อกลุ่ม คำอธิบายโมดูล "เร็ว ๆ นี้" คำทักทาย
- `styles.css`: `.launcher-*`, `.module-*`, `aria-current` ในเมนู, ปุ่มเข้าสู่ระบบ, มือถือ 2 คอลัมน์ซ่อนคำอธิบาย
- `packages/db/migrations/0006_notification_module.sql`, Drizzle schema, `migrate.ts`
- `packages/contracts/src/notifications.ts`: `moduleCode` (ไม่บังคับ, รูปแบบ `^[a-z][a-z0-9-]*$`) ใน payload และ `NotificationMessage`
- worker: เก็บ `module_code`; `RequestService`/`ApprovalService` ส่ง `moduleCode: 'requests'`
- `(app)/notifications`: แสดงป้ายชื่อโมดูลนำหน้าหัวข้อ
- `DESIGN.md`, `docs/integration/modules.md`

## Error handling

- ไม่มี `DATABASE_URL` หรือ query ล้ม: ตัวเลขเป็น "–", ปุ่มโมดูลยังแสดงครบ, log มีแค่รหัสข้อผิดพลาด
- `badge` ของโมดูลใดล้ม: ไม่แสดงป้ายนั้น

## Verification

- unit: `visibleModules` ตามบทบาท (ไม่มีบทบาท, hr-reader, hr-manager แบบระบุหน่วยงาน/ทั้งโรงพยาบาล), `planned` ไม่อยู่ในเมนู, ลำดับกลุ่ม, ไม่มี `code` ซ้ำ
- component: launcher แสดงลิงก์สำหรับ live และไม่ใช่ลิงก์สำหรับ planned, ป้ายมีข้อความสำหรับ screen reader, "–" เมื่อไม่มีตัวเลข
- integration (MariaDB): นับคำขอรอพิจารณาเฉพาะขั้นแรกที่ค้างของผู้ใช้ ไม่นับของคนอื่นหรือคำขอที่ปิดแล้ว, นับแจ้งเตือนยังไม่อ่าน
- การแจ้งเตือน: payload รับ/ปฏิเสธ `moduleCode`, worker เก็บ `module_code`, หน้าแสดง "[จองห้องประชุม] ..." และ "[คำขอ] ..." สำหรับแถวที่ไม่มีรหัส
- ภาพหน้าจอ desktop และมือถือด้วย Playwright เทียบกับภาพตัวอย่าง
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration`, `git diff --check`, `next build`
