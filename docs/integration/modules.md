# การเชื่อมโมดูลเข้าระบบ Back Office

แต่ละโมดูลพัฒนาในเธรดและ branch ของตัวเอง แล้วเสียบเข้าระบบกลางตามเอกสารนี้ ผู้ดูแลเอกสารคือเธรด "รีวิวโค้ด BackOffice" ถ้าโมดูลต้องเปลี่ยนส่วนกลางนอกเหนือจากที่เขียนไว้ ให้แจ้งเธรดนั้นก่อน

## 1. หน้าหลักและเมนู

เพิ่มหรือแก้รายการของโมดูลใน `apps/web/src/lib/modules.ts` เท่านั้น ห้ามแก้ `(app)/layout.tsx` เพื่อเพิ่มเมนู

```ts
{
  code: 'room-booking',            // ตรงกับ module_code ในฐานข้อมูลและ AccessResource
  href: '/rooms',
  labelKey: 'moduleRoomBooking',   // คีย์ใน packages/i18n/src/th.ts
  descriptionKey: 'moduleRoomBookingDescription',
  icon: 'room',                    // ชื่อใน components/module-icon.tsx
  group: 'services',               // mine | people | services | governance
  status: 'live',                  // planned ระหว่างพัฒนา, live เมื่อ PR ของโมดูล merge
  visible: () => true,             // ตัดสินจาก AccessSubject; หน้าและ API ต้องตรวจสิทธิ์เองอีกครั้ง
  badge: async (db, subject) => 0  // ไม่บังคับ; จำนวนงานรอผู้ใช้
}
```

หน้าหลักและเมนูด้านข้างมีหนึ่งปุ่มต่อหนึ่งโมดูลเท่านั้น ห้ามเพิ่มหน้าย่อยเป็นรายการแยกในระดับนี้ โมดูลที่มีหน้าย่อยใต้ `href` ของตัวเองให้ใส่ `sections` แล้วเพิ่ม `layout.tsx` กับ `page.tsx` ที่ route ของโมดูลซึ่งใช้ `ModuleLayout` และ `ModuleIndex` จาก `components/module-layout.tsx` (ดู `(app)/hr`) ระบบจะแสดงแถบเมนูย่อยเฉพาะเมนูที่ผู้ใช้เห็น และเปิด route ของโมดูลไปที่เมนูย่อยแรกให้เอง ปุ่มโมดูลจะแสดงเมื่อผู้ใช้เห็นเมนูย่อยอย่างน้อยหนึ่งเมนู

```ts
sections: [
  { href: '/hr/people', labelKey: 'people', visible: hasRole('hr-reader', 'hr-manager') },
  { href: '/hr/imports', labelKey: 'hrImport', visible: (subject) => ... }
]
```

โมดูลที่หน้าแรกเป็นหน้าทำงานเอง (เช่น ปฏิทินของจองห้องประชุม) ลิงก์หน้าย่อยจากหน้าแรกได้เหมือนเดิม

## 2. ฐานข้อมูล

- migration เป็นไฟล์ใหม่เท่านั้น (additive) และเพิ่มชื่อท้ายรายการใน `packages/db/src/migrate.ts` พร้อม Drizzle schema และ `infra/backup/restore-verify.test.sh` ถ้ามีตารางใหม่
- จองเลข migration ในตารางด้านล่างก่อนสร้างไฟล์ ถ้าเลขชนกันตอน rebase ฝ่ายที่ merge ทีหลังเปลี่ยนเลขของตัวเอง

| เลข | ไฟล์ | เจ้าของ | สถานะ |
|---|---|---|---|
| 0000–0004 | foundation, notifications, outbox retry, session, HR master data | — | merged |
| 0005 | `0005_room_booking.sql` | ระบบจองห้องประชุม | กำลังพัฒนา |
| 0006 | `0006_notification_module.sql` | หน้าหลักและการแจ้งเตือนกลาง (เธรดนี้) | กำลังพัฒนา |
| 0007 | `0007_request_cancellation.sql` | วงจรคำขอ (เธรดนี้) | กำลังพัฒนา |
| 0008 | `0008_inventory.sql` | ระบบคลังพัสดุ (รอบ 1: ทะเบียน รับเข้า ยอดยกมา ฉลาก QR) | รอ merge |
| 0009 | `0009_hr_command_chain.sql` | ระบบ HR | กำลังพัฒนา |
| 0010 | `0010_hr_staff_profile.sql` | ระบบ HR | กำลังพัฒนา |
| 0011 | `0011_leave.sql` | ระบบการลา (ประเภทการลา สิทธิ์การลา วันหยุด ใบลา ขอยกเลิกวันลา ยอดยกมา) | กำลังพัฒนา |
| 0012 | `0012_leave_type_gender.sql` | จำกัดประเภทการลาตามเพศ (ลาคลอดบุตรเฉพาะหญิง ลาไปช่วยภริยาคลอดบุตรเฉพาะชาย) | กำลังพัฒนา |
| 0013 | `0013_official_travel.sql` | ระบบไปราชการ (ประเภทการเดินทาง คำขอไปราชการ ผู้ร่วมเดินทาง) | กำลังพัฒนา |
| 0014 | `0014_official_travel_report.sql` | รายงานการไปราชการ | กำลังพัฒนา |

- ตารางของโมดูลใช้ prefix ของโมดูล (`room_*`) และอ้างอิงบุคลากรด้วย `person.id` เท่านั้น
- เก็บเวลาเป็น UTC แสดงเป็น Asia/Bangkok

## 3. สิทธิ์

- permission ใหม่เพิ่มใน `permissionSchema` (`packages/contracts/src/access.ts`) ชื่อ `<module>.<entity>.<verb>` และผูกบทบาทใน `packages/core/src/access/policy.ts`
- ทุก API และหน้า server ตรวจด้วย `AuthorizationService` เสมอ การซ่อนปุ่มไม่ใช่การกันสิทธิ์

## 4. การแจ้งเตือน, audit และ outbox

- เปลี่ยนสถานะ + audit + outbox ใน transaction เดียว
- audit action ชื่อ `<module>.<entity>.<verb>`; metadata ใช้คีย์ที่อยู่ใน redact allowlist เท่านั้น
- ห้ามมีเลขบัตรประชาชน รหัสผ่าน token เหตุผลการตัดสิน หรือเนื้อหาไฟล์แนบ ใน URL, log, audit metadata, notification หรือ outbox payload
- **แจ้งผู้ใช้ผ่านศูนย์การแจ้งเตือนกลางเท่านั้น** ห้ามสร้างตารางหรือหน้าการแจ้งเตือนของโมดูลเอง: เขียน outbox `type: 'notification.in_app'` ด้วย `notificationEventPayloadSchema` ใน transaction เดียวกับการเปลี่ยนสถานะ และ **ต้องใส่ `moduleCode`** เป็นรหัสเดียวกับ registry หน้าการแจ้งเตือนจะแสดง `[ชื่อโมดูล] subject` เอง จึงห้ามใส่ชื่อโมดูลใน `subject`

```ts
notificationEventPayloadSchema.parse({ recipientPersonId, moduleCode: 'room-booking', targetPath: `/rooms/bookings/${bookingId}`, subject: 'การจองได้รับการอนุมัติ' })
// ผู้ใช้เห็น: [จองห้องประชุม] การจองได้รับการอนุมัติ
```

- `idempotencyKey` ของ outbox ใช้รูปแบบ `notification.in_app:<module>:<event>:<id>`
- ผู้ใช้กดการแจ้งเตือนแล้วระบบเปิดหน้าของโมดูลให้อัตโนมัติ: ใส่ `targetPath` เป็นหน้าที่เกี่ยวข้องเสมอ (เช่น หน้ารายละเอียดการจอง)
- การแจ้งเตือนที่ไม่ใช่คำขอกลางให้ลิงก์ผ่าน `notification.target_path` (เพิ่มโดยโมดูลจองห้อง) ค่าต้องขึ้นต้นด้วย `/` และไม่มี `//`
- ชื่อ action ใหม่ต้องมีคำแปลไทยในหน้าบันทึกการตรวจสอบ

## 5. ภาษาและหน้าจอ

- เพิ่มสีประจำโมดูลหนึ่งบรรทัด `[data-module="<code>"] { --accent: #...; }` ใน `apps/web/src/app/styles.css` และในตารางสีของ `DESIGN.md` สไตล์ของโมดูลใช้ `var(--accent)` และ token อื่น ห้ามฝัง hex
- การยืนยันหรือกรอกเหตุผลใช้ `ActionDialog` ห้ามทำฟอร์มยืนยันในหน้าเอง

- ศัพท์ใหม่เพิ่มใน `CONTEXT.md` ก่อนใช้ในโค้ดหรือหน้าจอ
- ข้อความไทยอยู่ใน `packages/i18n/src/th.ts` ใช้ prefix ของโมดูลกับคีย์ใหม่
- หน้าอยู่ใต้ `apps/web/src/app/(app)/<route>` ใช้ AppShell เดิม และทำตาม `DESIGN.md`

## 6. ส่งงาน

- branch แยกต่อโมดูล เปิด PR เข้า `main` ห้าม push ตรง
- ก่อน merge: rebase บน `main` ล่าสุด แก้เลข migration ถ้าชน และเปลี่ยน `status` ของโมดูลใน registry เป็น `live` ใน PR เดียวกัน
