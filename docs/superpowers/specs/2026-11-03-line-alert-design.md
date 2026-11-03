# การแจ้งเตือน LINE (LINE alert) — design

วันที่: 2026-11-03 · ผู้ขอ: wasan

## เป้าหมาย

เมื่อมีงานรอให้หัวหน้า หัวหน้ากลุ่มงาน หรือผู้จัดการโมดูลดำเนินการ ระบบส่งข้อความเข้า **กลุ่ม LINE** ของโมดูลนั้น และ @mention คนที่ต้องทำ เช่น

```
@jackyhokk [จองห้องประชุม] มีคำขอใหม่ 1 รายการ
https://192.168.1.20:8443/rooms/bookings/…
```

ชื่อหลัง @ เป็นชื่อที่เจ้าตัวตั้งใน LINE เสมอ (LINE แสดงเอง ระบบกำหนดไม่ได้)

## สิ่งที่ผู้ใช้ตกลงแล้ว

- ใช้ LINE Official Account + Messaging API (LINE Notify ปิดบริการแล้ว)
- รับ webhook ผ่าน URL สาธารณะ (แนะนำ Cloudflare Tunnel ที่เปิดเฉพาะ `/api/line/webhook`) และให้ผู้ดูแลระบบเพิ่มรหัสกลุ่มเองได้ด้วย
- รูปแบบข้อความตามตัวอย่างข้างบน

## ข้อจำกัดของ LINE ที่กำหนดการออกแบบ

1. การ @mention ต้องใช้ userId ภายในของ LINE (`U` + 32 hex) ไม่ใช่ LINE ID ที่ตั้งเอง userId ได้มาจาก webhook เมื่อเจ้าตัวส่งข้อความถึงบอทเท่านั้น
2. groupId (`C` + 32 hex) ได้จาก webhook ตอนบอทถูกเชิญเข้ากลุ่ม
3. คนที่ถูก @ ต้องอยู่ในกลุ่มนั้น LINE จึงจะแจ้งเตือนเขา
4. Push message นับโควตาของ Official Account ตามจำนวนสมาชิกในกลุ่ม แผนฟรีมีโควตาจำกัด ผู้ดูแลต้องเลือกแผนเอง
5. ข้อความออกนอกโรงพยาบาล จึงมีเฉพาะ @ชื่อ ชื่อโมดูล ข้อความคงที่ และลิงก์ ไม่มีชื่อผู้ยื่น เหตุผล วันลา หรือข้อมูลส่วนตัวอื่น

## ภาพรวม

```
โมดูล (ธุรกรรมเดิม) ──► outbox: notification.in_app { actionRequired: true }
                                   │
                         worker NotificationConsumer
                                   ├─ เขียนกล่องแจ้งเตือนในระบบ (เหมือนเดิม)
                                   └─ ต่อคิว outbox: notification.line (INSERT IGNORE)
                                                │
                                   worker LineAlertConsumer
                                     หา กลุ่ม LINE ของโมดูล + บัญชี LINE ของผู้รับ
                                     ไม่ครบ → จบ (ไม่ส่ง) / ครบ → push textV2 พร้อม mention

LINE ──► POST /api/line/webhook (ตรวจลายเซ็น X-Line-Signature)
           ├─ join / leave กลุ่ม → บันทึก กลุ่ม LINE
           └─ ข้อความเป็น รหัสเชื่อมต่อ → ผูกบัญชี LINE กับบุคลากร แล้วตอบกลับ
```

## คำศัพท์ (เพิ่มใน CONTEXT.md)

- **บัญชี LINE ที่เชื่อมต่อ**: userId ของ LINE ที่บุคลากรผูกกับตัวเองผ่านรหัสเชื่อมต่อ หนึ่งคนหนึ่งบัญชี หนึ่งบัญชีหนึ่งคน
- **รหัสเชื่อมต่อ LINE**: รหัส 8 ตัวอักษรที่ระบบสร้างให้บุคลากร ใช้ได้ครั้งเดียวภายใน 10 นาที ส่งในแชตกับบอทเพื่อผูกบัญชี
- **กลุ่ม LINE**: กลุ่มที่บอทของโรงพยาบาลเป็นสมาชิก ระบบรู้จากเหตุการณ์ join หรือผู้ดูแลระบบเพิ่มเอง
- **กลุ่มแจ้งเตือนของโมดูล**: กลุ่ม LINE หนึ่งกลุ่มที่ผู้ดูแลระบบกำหนดให้โมดูลหนึ่ง (ไม่กำหนด = ไม่ส่ง LINE)
- **การแจ้งเตือนที่ต้องดำเนินการ**: การแจ้งเตือนในระบบที่ผู้รับต้องพิจารณาหรือจัดการ (`actionRequired`) เฉพาะแบบนี้ที่ส่ง LINE

## ข้อมูล (migration `0028_line_alert.sql`, additive)

| ตาราง | คอลัมน์ | หมายเหตุ |
|---|---|---|
| `line_account_link` | `person_id` PK, `line_user_id` UNIQUE, `linked_at` | หนึ่งต่อหนึ่ง |
| `line_link_code` | `code_hash` PK (sha256 hex), `person_id` UNIQUE, `expires_at`, `created_at` | ขอรหัสใหม่แทนที่รหัสเก่า; เก็บ hash ไม่เก็บรหัส |
| `line_group` | `group_id` PK, `display_name` NULL, `source` (`WEBHOOK`/`MANUAL`), `joined_at`, `left_at` NULL | |
| `line_module_route` | `module_code` PK, `group_id`, `updated_by_person_id`, `updated_at` | |

## การตั้งค่า (ไฟล์ `.env` หรือ `<NAME>_FILE`)

| ตัวแปร | ใช้ที่ | ความลับ |
|---|---|---|
| `LINE_CHANNEL_ACCESS_TOKEN` | worker (push), web (reply, ข้อมูลกลุ่ม, ทดสอบ) | ใช่ |
| `LINE_CHANNEL_SECRET` | web (ตรวจลายเซ็น webhook) | ใช่ |
| `LINE_BOT_BASIC_ID` | web (ลิงก์เพิ่มเพื่อน เช่น `@123abcd`) | ไม่ |
| `BACKOFFICE_PUBLIC_URL` | worker (ลิงก์ในข้อความ เช่น `https://192.168.1.20:8443`) | ไม่ |

ไม่ตั้ง `LINE_CHANNEL_ACCESS_TOKEN` = ระบบทำงานตามเดิมทุกอย่าง แค่ไม่ส่ง LINE หน้า **ตั้งค่าการเชื่อมต่อ** มีแถว LINE บอกว่าตั้งค่าแล้วหรือยัง (ไม่แสดงค่า)

## พฤติกรรม

### 1. เชื่อมต่อ LINE (บุคลากรทุกคน, หน้า `/hr/me`)

- ปุ่ม **เชื่อมต่อ LINE** ข้างปุ่มเปลี่ยนรหัสผ่าน เปิด `FormDialog`
- ยังไม่เชื่อมต่อ: ปุ่ม **สร้างรหัสเชื่อมต่อ** → `POST /api/line/link-code` คืนรหัส 8 ตัว (อักษร `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`) และเวลาหมดอายุ popup แสดงรหัส ขั้นตอน และลิงก์เพิ่มเพื่อน `https://line.me/R/ti/p/<LINE_BOT_BASIC_ID>`
- เชื่อมต่อแล้ว: แสดง "เชื่อมต่อแล้ว เมื่อ …" และปุ่ม **ยกเลิกการเชื่อมต่อ** ยืนยันใน `ActionDialog` → `DELETE /api/line/link`
- รหัสไม่ใส่ใน URL, log, audit, outbox
- audit: `line.account.link_code_created`, `line.account.linked`, `line.account.unlinked` (metadata ไม่มีรหัสและไม่มี userId)

### 2. Webhook `POST /api/line/webhook` (ไม่ต้องล็อกอิน)

- ตรวจ `X-Line-Signature` = base64(HMAC-SHA256(channel secret, raw body)) แบบ timing-safe ไม่ผ่าน → 401 ไม่ได้ตั้ง secret → 503
- `join` จากกลุ่ม → upsert `line_group` (`source=WEBHOOK`, `left_at=NULL`, ชื่อจาก `GET /v2/bot/group/{id}/summary` ถ้าดึงได้) audit `line.group.joined`
- `leave` → ตั้ง `left_at` audit `line.group.left`
- `unfollow` (บล็อกบอท) → ยกเลิกการเชื่อมต่อของ LINE user นั้น audit `line.account.unlinked`
- `message` จากแชตส่วนตัวกับบอทเท่านั้น (`source.type = user`; ข้อความในกลุ่มไม่อ่าน) ข้อความที่ (ตัดช่องว่างและขีด, ตัวพิมพ์ใหญ่) ตรงรูปรหัส 8 ตัว → หา hash ที่ยังไม่หมดอายุ
  - พบ: ลบรหัส, ผูกบัญชี (ถ้า userId นี้ผูกกับคนอื่นอยู่ ย้ายมาคนนี้; ถ้าคนนี้มีบัญชีเก่า แทนที่) audit `line.account.linked` ใน transaction เดียวกัน แล้ว reply "เชื่อมต่อบัญชี LINE กับ Back Office แล้ว"
  - ไม่พบ: reply "รหัสไม่ถูกต้องหรือหมดอายุ กรุณาสร้างรหัสใหม่ในระบบ"
- เหตุการณ์อื่นไม่ทำอะไร ตอบ 200 เสมอเมื่อลายเซ็นถูก (การ reply ล้มเหลวไม่ทำให้ตอบ error)
- ไม่ log body หรือข้อความ

### 3. ตั้งค่า LINE (ผู้ดูแลระบบ, `/admin/line` แท็บ "แจ้งเตือน LINE")

- สถานะการตั้งค่า (ตั้งแล้ว/ยังไม่ตั้ง ต่อตัวแปร) และ Webhook URL ที่ต้องใส่ใน LINE Developers: `<URL สาธารณะ>/api/line/webhook`
- ตารางกลุ่ม LINE: ชื่อ รหัส ที่มา สถานะ (อยู่ในกลุ่ม/ออกแล้ว) ปุ่ม **ส่งข้อความทดสอบ** (ActionDialog) และ **เพิ่มกลุ่ม** (FormDialog: รหัสกลุ่ม `^C[0-9a-f]{32}$`, ชื่อ) audit `line.group.added`
- ตารางโมดูล live (ยกเว้น admin): กลุ่มแจ้งเตือนปัจจุบัน ปุ่ม **แก้ไข** เปิด FormDialog เลือกกลุ่มหรือ "ไม่ส่ง LINE" audit `line.route.changed`
- จำนวนบุคลากรที่เชื่อมต่อ LINE แล้ว
- ทุก API ใต้ `/api/admin/line/**` ผ่าน `withAdmin` (ตรวจบนเซิร์ฟเวอร์)

### 4. ส่งการแจ้งเตือน

- `notificationEventPayloadSchema` เพิ่ม `actionRequired?: boolean`
- ผู้ส่งที่ตั้ง `actionRequired: true`:
  - workflow: `มีคำขอรอพิจารณา` (ยื่นและยื่นใหม่) ครอบคลุมการลา ไปราชการ ขอใช้รถ และจองห้องขั้นหัวหน้า
  - จองห้องประชุม: `มีการจองห้องรออนุมัติ` ถึงผู้จัดการโมดูล
  - คลังพัสดุ: `มียอดยกมารอรับรอง`
  - ยานพาหนะ: `มีใบขอใช้รถรอจัดรถ` ถึงผู้จัดการ
- Worker `NotificationConsumer`: event `notification.in_app` ที่ `actionRequired` และมี `moduleCode` → `INSERT IGNORE` outbox `notification.line` key `notification.line:<eventId>` payload `{ recipientPersonId, moduleCode, targetPath }` (targetPath = เดิม หรือ `/requests/<requestId>`) ก่อน claim กล่องแจ้งเตือน ทั้งสองขั้น idempotent จึง retry ได้
- Worker `LineAlertConsumer` (`notification.line`):
  - ไม่ตั้ง token → จบ (processed)
  - ไม่มีกลุ่มแจ้งเตือนของโมดูล, กลุ่มออกแล้ว, หรือผู้รับไม่ได้เชื่อมต่อ LINE → จบ
  - ส่ง `POST https://api.line.me/v2/bot/message/push` header `X-Line-Retry-Key: <eventId>` ข้อความ `textV2`:
    `{m} [<ชื่อโมดูล>] มีคำขอใหม่ 1 รายการ\n<BACKOFFICE_PUBLIC_URL><targetPath>` (ไม่มี URL สาธารณะ = ไม่มีบรรทัดลิงก์) substitution `m` = mention userId
  - 2xx หรือ 409 (retry key ซ้ำ = ส่งไปแล้ว) = สำเร็จ; อื่น ๆ throw `LINE_PUSH_FAILED` ให้ outbox retry/dead-letter ตามเดิม
- ข้อความ LINE ไม่ถูกเขียนลงตาราง `notification`

## ความปลอดภัยและข้อมูลส่วนบุคคล

- Webhook เป็นจุดเดียวที่ไม่ต้องล็อกอิน ป้องกันด้วยลายเซ็น
- ข้อความ LINE ไม่มีข้อมูลของผู้ยื่น ลิงก์เปิดได้เฉพาะใน LAN และหน้าปลายทางตรวจสิทธิ์เอง
- token/secret อยู่ใน `.env` หรือไฟล์ secret เท่านั้น ไม่แสดงใน UI ไม่อยู่ใน log
- ยกเลิกการเชื่อมต่อได้ทุกเมื่อ บุคลากรที่พ้นสภาพ: ผู้ดูแลลบได้ด้วยการยกเลิกการเชื่อมต่อในอนาคต (ไม่อยู่ในรอบนี้)

## นอกขอบเขตรอบนี้

- รวมหลายรายการเป็นข้อความเดียว ("มีคำขอใหม่ 3 รายการ")
- กลุ่มต่อหน่วยงาน (รอบนี้หนึ่งกลุ่มต่อโมดูล)
- ให้ผู้จัดการโมดูลตั้งกลุ่มเอง (รอบนี้ผู้ดูแลระบบ)
- แจ้งเตือนข้อมูลทั่วไป (อนุมัติแล้ว ยกเลิก) ทาง LINE

## การทดสอบ

- Unit: ตรวจลายเซ็น, สร้าง/ตรวจรูปรหัส, สร้างข้อความ textV2, LineAlertConsumer (ไม่มี token/กลุ่ม/บัญชี, 2xx, 409, 500), NotificationConsumer ต่อคิว LINE เฉพาะ actionRequired, ผู้ส่งแต่ละโมดูลตั้ง actionRequired
- Integration (MariaDB): LineService ผูกบัญชี/ย้ายบัญชี/รหัสหมดอายุ/กลุ่ม join-leave/route + audit ใน transaction เดียว, migration
- Web: route webhook (ลายเซ็นผิด 401, รหัสถูก/ผิด), API admin ปฏิเสธคนที่ไม่ใช่ผู้ดูแล, popup เชื่อมต่อ LINE
