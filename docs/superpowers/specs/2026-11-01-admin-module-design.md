# โมดูลผู้ดูแลระบบ (Administrator) — design

วันที่: 2026-11-01 · branch `claude/admin-module`

## เป้าหมาย

โมดูลใหม่ `admin` ("ผู้ดูแลระบบ") ที่เข้าได้เฉพาะผู้มีบทบาท **ผู้ดูแลระบบ** (role `admin`) มีแถบเมนูด้านบน (section bar เดียวกับโมดูลอื่น) ประกอบด้วย

| section | href | เนื้อหา |
|---|---|---|
| ตั้งค่าการเชื่อมต่อ | `/admin/connections` | สถานะการเชื่อมต่อแบบอ่านอย่างเดียว: ฐานข้อมูล (ping จริง), Redis (ping จริงถ้าตั้ง `REDIS_URL`), ที่เก็บไฟล์, ตัวสแกนไฟล์, อีเมล — แสดงแค่ "ตั้งค่าแล้ว/ยังไม่ตั้ง" และผลการเชื่อมต่อ ไม่แสดง URL รหัสผ่าน หรือ key การแก้ค่าเหล่านี้ทำผ่าน environment ตาม runbook ไม่ได้ทำจากหน้าจอ (หน้าบอกไว้) |
| ตั้งค่าโปรแกรม | `/admin/modules` | รายการโมดูลที่ใช้งานแล้ว (live) พร้อมปุ่มเปิด/ปิด (ยืนยันด้วย ActionDialog) คลิกชื่อโมดูลเปิด popup รายชื่อผู้จัดการโมดูล เพิ่ม/ลบได้ |
| กำหนดสิทธิ | `/admin/grants` | ทุกสิทธิ admin และผู้จัดการโมดูล จัดกลุ่มตามบุคลากร เพิ่ม/แก้ไข/ลบใน popup หนึ่งคนมีได้หลายสิทธิ |
| บันทึกของผู้ดูแล | `/admin/audit` | บันทึกการตรวจสอบที่ action ขึ้นต้นด้วย `admin.` ทุกคน (ใครทำ ทำอะไร เมื่อไร) |

section ใหม่เพิ่มได้โดยเพิ่มหนึ่งรายการใน `sections` ของ entry `admin` ใน `apps/web/src/lib/modules.ts` และหนึ่งหน้าใต้ `app/(app)/admin/`

## บทบาทและสิทธิ์ (ใช้ระบบเดิม ไม่สร้างระบบคู่ขนาน)

- **ผู้ดูแลระบบ** = role `admin` ในตาราง `role` / `role_assignment` เดิม (organization_id = NULL เสมอ)
- **ผู้จัดการโมดูล X** = role ผู้จัดการเดิมของโมดูลนั้น (hospital-wide) ตามตาราง mapping ใน `packages/core/src/admin/module-managers.ts`

| โมดูล | role ผู้จัดการ | permission ที่ได้ | หมายเหตุ |
|---|---|---|---|
| งานบุคคล `hr` | `hr-manager` | hr.person.*, hr.organization.manage, leave.manage, travel.manage | เดิม; การแก้ข้อมูลยังต้องเป็น **เจ้าของข้อมูล** HR (data_owner_assignment) ด้วย |
| การลา `leave` | `leave-manager` (ใหม่) | leave.manage | `canManageLeave` ต้องมีเจ้าของข้อมูล HR ทั้งโรงพยาบาลเหมือนเดิม — popup แสดงคำเตือนถ้ายังไม่ได้มอบหมาย |
| ไปราชการ `official-travel` | `travel-manager` (ใหม่) | travel.manage | เหมือนการลา |
| จองห้องประชุม `room-booking` | `room-manager` | room.manage | เดิม |
| คลังพัสดุ `inventory` | `inventory-officer` | inventory.item.manage, stock.receive, stock.read | เดิม; `inventory-supervisor` (รับรองยอดยกมา) แยกไว้เพื่อแบ่งหน้าที่ ไม่ใช่ผู้จัดการ |
| ยานพาหนะ `fleet` | `fleet-manager` | fleet.manage | เดิม |
| สิทธิ์และการตรวจสอบ `access`, คำขอ, การแจ้งเตือน | — | — | ไม่มีผู้จัดการแยก ผู้ดูแลระบบดูแล |

การเป็นเจ้าของข้อมูลไม่ได้มอบจากโมดูลนี้ (CONTEXT: ผู้ดูแลระบบไม่ได้เป็นเจ้าของข้อมูลโดยอัตโนมัติ — การมอบหมายเจ้าของข้อมูลเป็นกระบวนการของ Data Owner)

**admin เป็นผู้จัดการทุกโมดูล**: `AuthorizationService` ถือว่า subject ที่มี role `admin` แบบไม่จำกัดหน่วยงานผ่านทุก permission ทั้งโรงพยาบาล (`canAccess` allowed, `organizationScope` = `all`, `canActHospitalWide` = true) รวมถึงด่านเจ้าของข้อมูล เพราะผู้ใช้กำหนดว่า admin เป็นผู้จัดการทุกโมดูล ข้อนี้บันทึกใน CONTEXT ว่าเป็นข้อยกเว้นที่ตั้งใจ ทุก `canManage*` และการตรวจ `hasRole(...)` ในเมนูจึงผ่านไปด้วย ส่วน `roleGrantsPermission` ไม่เปลี่ยน เพื่อไม่ให้ผู้ดูแลระบบถูกใส่ในรายชื่อผู้รับแจ้งเตือนของโมดูล (เช่น `fleetManagerPersonIds`)

**ผู้ให้สิทธิ**: เฉพาะ admin ให้/ถอนสิทธิ admin และผู้จัดการได้ ตรวจที่ server ทุก API (`isAdmin(session)`) ไม่ใช่แค่ซ่อนเมนู

**กติกา**
- ถอน admin คนสุดท้ายไม่ได้ (`LAST_ADMIN`) — ตรวจใน transaction โดย lock แถว role_assignment ของ admin ก่อนนับ
- ให้สิทธิซ้ำไม่ได้ผล (idempotent ไม่สร้างแถวซ้ำ)
- ให้สิทธิได้เฉพาะบุคลากรสถานะปฏิบัติงาน
- แก้ไข = กำหนดชุดสิทธิของบุคคลใหม่ทั้งชุด (เพิ่มที่ขาด ลบที่เกิน) ใน transaction เดียว

## เปิด/ปิดโมดูล

- ตารางใหม่ `admin_module_setting (module_code PK, enabled, updated_at, updated_by_person_id)` migration `0020_admin_module.sql`; ไม่มีแถว = เปิด
- โมดูลที่ปิด: ซ่อนจากเมนูและหน้าหลัก และ **หน้าและ API ปฏิเสธที่ server** ผ่าน `apps/web/src/proxy.ts` (Next proxy, ทำงานก่อนทุก request) ที่จับ path ของโมดูล (`/leave/...`, `/api/leave/...`) — หน้าได้หน้า "โมดูลนี้ปิดใช้งาน" (403) API ได้ `{ error: 'module_disabled' }` 403 ใช้กับทุกคนรวม admin (admin เปิดกลับได้จากหน้าตั้งค่าโปรแกรม)
- ปิด `admin` ไม่ได้ (`MODULE_LOCKED`); หน้าหลัก `/dashboard` ไม่ใช่โมดูลจึงปิดไม่ได้
- โมดูล planned ไม่แสดงในรายการ (ยังไม่มีอะไรให้ปิด)

## Audit (transaction เดียวกับการเปลี่ยนแปลง)

| action | target | metadata |
|---|---|---|
| `admin.module.enabled` / `admin.module.disabled` | `module` / code | `moduleCode` |
| `admin.role.granted` / `admin.role.revoked` | `person` / personId | `personId`, `roleName` |

`roleName` เพิ่มใน redact allowlist ไม่มีรหัสผ่าน token หรือเลขบัตรใน metadata URL หรือ log

## Seed (dev/demo เท่านั้น)

`seedLocalDemo` เพิ่มหน่วยงาน `IT งานเทคโนโลยีสารสนเทศ` (ใต้ ADM) และบุคลากรสมมติ `IT001 นายจีระศักดิ์ หอกคำ` บัญชี local `it001` (เข้าสู่ระบบด้วย IT001 ได้ เพราะชื่อผู้ใช้ไม่สนตัวพิมพ์) รหัสผ่านเดียวกับบัญชีทดสอบอื่น (ค่าที่ส่งให้ seed) และ role `admin` — idempotent

## UI

- popup ทุกฟอร์มใช้ `components/admin-form-dialog.tsx` ซึ่งห่อ `ActionDialog` (native `<dialog>`) ไว้ในที่เดียว เพื่อสลับเป็น FormDialog กลางได้ภายหลัง
- สีประจำโมดูล `[data-module="admin"] { --accent: #374151; }`

## นอกขอบเขต

แก้ค่าการเชื่อมต่อจากหน้าจอ, มอบหมายเจ้าของข้อมูล, ผู้จัดการแบบจำกัดหน่วยงาน (หน้ากำหนดสิทธิแสดงและแก้เฉพาะการมอบหมายทั้งโรงพยาบาล การมอบหมายแบบจำกัดหน่วยงานที่มีอยู่ไม่ถูกแตะ), ผู้จัดการของโมดูล planned, ปุ่มเปลี่ยนรหัสผ่าน

หมายเหตุ: ปิดโมดูลงานบุคคล (`hr`) จะปิด `/api/hr/*` ทั้งหมด รวมถึงรูปประจำตัวในชิปโปรไฟล์ด้วย
