# หน้า setup ครั้งแรก (First-run setup) — Design

Date: 2026-10-27
Status: Draft for review

## Goal

ผู้ติดตั้งเปิดเว็บที่ยังไม่มีค่าเชื่อมฐานข้อมูล แล้วตั้งค่าการเชื่อมต่อ MariaDB และสร้างบัญชี **super admin** คนแรกจากหน้าเว็บได้ โดยไม่ต้องแก้ไฟล์ secret หรือเขียน SQL เอง เมื่อตั้งค่าเสร็จ หน้า setup ต้องปิดถาวร

ผู้ใช้หลัก: ผู้ติดตั้งระบบของโรงพยาบาล ซึ่งเข้าเครื่องเซิร์ฟเวอร์ได้ (อ่าน `docker compose logs web` ได้)

## What the user said vs. what is assumed

ผู้ใช้ตัดสินใจ:
- หน้า config ใช้เฉพาะ **ตั้งค่าครั้งแรก** แล้วล็อกตัวเอง ไม่ใช่หน้าที่แก้ได้ตลอด
- บัญชีแรกเป็นบทบาท **super admin ทำได้ทุกอย่าง**
- อนุมัติร่างการออกแบบในเธรด (รหัส setup จาก log, volume config, การขยายสิทธิ์ตอนโหลด session)

สมมติฐาน (แก้ได้ตอนตรวจ spec):
- เว็บรันด้วย Docker ตาม `docker-compose.production.yml` และฐานข้อมูลอาจอยู่นอก compose เช่น `192.168.1.254`
- คีย์อื่น (`BACKOFFICE_SESSION_SECRET`, `NATIONAL_ID_ENCRYPTION_KEY`, `NATIONAL_ID_LOOKUP_KEY`, S3) ยังตั้งเป็นไฟล์ secret ตาม runbook เดิม หน้า setup ตั้งเฉพาะค่าเชื่อมฐานข้อมูล
- ฐานข้อมูลอาจเตรียมไว้แล้วด้วยสคริปต์ SQL ของเธรดนี้ (ผู้ใช้แอปมีสิทธิ์แค่ DML) หรือเป็นฐานว่างที่ผู้ใช้มีสิทธิ์ DDL

## Non-goals

- หน้าแก้ค่าเชื่อมฐานหลังติดตั้ง (เปลี่ยนค่าทำโดย operator แก้ไฟล์ใน volume แล้ว restart)
- หน้ามอบบทบาทให้บุคลากรอื่น (งานถัดไป)
- ตั้งค่า Redis, SeaweedFS, ClamAV, คีย์เข้ารหัส จากหน้าเว็บ
- รองรับฐานข้อมูลอื่นนอกจาก MariaDB

## Behaviour

### 1. เมื่อไรที่อยู่ในโหมด setup

เว็บอยู่ในโหมด setup เมื่อหา `DATABASE_URL` ไม่เจอจากทุกแหล่ง ลำดับการหาค่า (ค่าแรกที่เจอชนะ):

1. env `DATABASE_URL`
2. ไฟล์ที่ `DATABASE_URL_FILE` ชี้
3. ไฟล์ `${BACKOFFICE_CONFIG_DIR}/database_url` (ค่าเริ่มต้น `BACKOFFICE_CONFIG_DIR=/var/lib/backoffice/config`)

ถ้า operator ตั้งข้อ 1 หรือ 2 ไว้ หน้า setup จะไม่เปิดเลย

ในโหมด setup:
- `/` และทุกหน้าใต้ `(app)` redirect ไป `/setup`
- API อื่นตอบ `503` เหมือนตอนไม่มีฐาน (พฤติกรรมเดิมของ `getSharedDatabase() === null`)
- `/api/health` ตอบ `200` พร้อม `{ status: 'setup-required' }` เพื่อให้ healthcheck ของ compose ผ่านและ Caddy ส่งต่อได้

นอกโหมด setup: `/setup` และ `/api/setup/*` ตอบ `404`

### 2. รหัส setup

- ตอนเว็บเริ่มทำงาน (Next.js `instrumentation.ts` `register()`, runtime Node) ถ้าอยู่ในโหมด setup ให้สุ่มรหัส 12 ตัวอักษรจาก base32 (ไม่มี 0/O/1/I) แสดงเป็น `XXXX-XXXX-XXXX`
- พิมพ์ลง stdout หนึ่งบรรทัด: `backoffice.setup.code XXXX-XXXX-XXXX` (รหัสนี้ไม่ใช่ความลับระยะยาว ใช้ได้ครั้งเดียว และตายเมื่อ setup เสร็จหรือ restart)
- เก็บในหน่วยความจำเป็น SHA-256 hash เท่านั้น เทียบด้วย `timingSafeEqual`
- กรอกผิดครบ 5 ครั้ง: ทิ้งรหัสเดิม สุ่มใหม่ พิมพ์ลง log อีกบรรทัด
- รหัสไม่เคยอยู่ใน URL, response, หรือ audit metadata

### 3. หน้า `/setup`

ฟอร์มเดียว แบ่งเป็น 3 ส่วน ภาษาไทยทั้งหมด ตาม `DESIGN.md`:

**ก. ยืนยันสิทธิ์ติดตั้ง** — รหัส setup (พร้อมคำอธิบายว่าดูได้จาก `docker compose logs web`)

**ข. ฐานข้อมูล** — host, port (ค่าเริ่มต้น 3306), ชื่อฐาน (ค่าเริ่มต้น `backoffice`), ชื่อผู้ใช้, รหัสผ่าน ปุ่ม "ทดสอบการเชื่อมต่อ" แสดงผลรุ่น MariaDB และจำนวน migration ที่ยังไม่ได้รัน

**ค. บัญชี super admin** — ชื่อที่แสดง, รหัสพนักงาน, เลขบัตรประชาชน (ตรวจ checksum 13 หลัก), ชื่อผู้ใช้, รหัสผ่าน + ยืนยันรหัสผ่าน (อย่างน้อย 12 ตัว)

ก่อนแสดงฟอร์ม หน้า setup ตรวจว่ามีคีย์ที่ต้องใช้ครบ ถ้าขาด แสดงชื่อตัวแปรที่ขาด (ไม่แสดงค่า) และปิดปุ่มบันทึก:
`BACKOFFICE_SESSION_SECRET`, `NATIONAL_ID_ENCRYPTION_KEY`, `NATIONAL_ID_LOOKUP_KEY`

### 4. API

ทุก endpoint รับ JSON ผ่าน `POST`, ตรวจด้วย zod schema ใน `packages/contracts`, และตรวจรหัส setup ทุกครั้งบน server

- `POST /api/setup/test-connection` — `{ code, database }` → `{ ok: true, serverVersion, pendingMigrations: number, hasAccounts: boolean }` หรือ `{ ok: false, error }`
- `POST /api/setup/complete` — `{ code, database, admin }` → `{ ok: true }` แล้ว client ไปหน้า `/` เพื่อล็อกอิน

รหัส error (แปลเป็นข้อความไทยที่ client): `invalid_code`, `connection_failed`, `access_denied`, `migration_privilege_missing`, `unsupported_server`, `accounts_exist`, `keys_missing`, `invalid_input`, `already_configured`

ข้อความ error ของ driver ไม่ส่งกลับ client และไม่ log รหัสผ่านหรือ URL เต็ม (log ได้แค่ error code ของ driver เช่น `ER_ACCESS_DENIED_ERROR`)

### 5. ขั้นตอน `complete` (ลำดับสำคัญ)

1. ยืนยันว่ายังอยู่ในโหมด setup และไม่มีการ complete อื่นกำลังทำอยู่ (mutex ในหน่วยความจำ) ไม่งั้นตอบ `already_configured`
2. ตรวจรหัส setup และ input
3. เชื่อมต่อด้วย pool ชั่วคราว (ขนาด 1) ตรวจ `SELECT VERSION()` ต้องเป็น MariaDB 10.6 ขึ้นไป
4. หา migration ที่ยังไม่ได้รัน (อ่าน `schema_migration` ถ้ามี) ถ้ามี ให้รัน `runMigrations` ถ้าถูกปฏิเสธเพราะสิทธิ์ (`1142`, `1044`) ตอบ `migration_privilege_missing` พร้อมคำแนะนำให้รันสคริปต์ SQL ด้วย root หรือให้สิทธิ์ `CREATE, ALTER, INDEX, REFERENCES`
5. ถ้ามีแถวใน `local_account` อยู่แล้ว ตอบ `accounts_exist` (กันการเอาหน้า setup ไปยัดบัญชีลงฐานที่ใช้งานอยู่) operator ที่ต้องการต่อเว็บเข้ากับฐานเดิมให้เขียนไฟล์ `database_url` เอง
6. ใน **transaction เดียว**:
   - `person` (เลขบัตรเข้ารหัสด้วย `NationalIdProtector`, `employee_code`, `display_name`)
   - `local_account` (รหัสผ่าน hash ด้วย `hashPassword` เดิม แบบ scrypt)
   - `role` ชื่อ `super-admin` (สร้างถ้ายังไม่มี)
   - `role_assignment` ของ super admin โดย `organization_id = NULL`
   - `audit_event` action `system.setup.completed`, actor = super admin, target = person, metadata มีแค่ `{ serverVersion, migrationsApplied }`
7. เขียนไฟล์ `${BACKOFFICE_CONFIG_DIR}/database_url` แบบ atomic (เขียนไฟล์ชั่วคราว mode `0600` ในไดเรกทอรีเดียวกัน แล้ว `rename`) ถ้าเขียนไม่ได้ ข้อมูลในฐานยังอยู่ ตอบ error `config_write_failed` และ log สาเหตุ (ไม่ log ค่า) รอบถัดไปจะติด `accounts_exist` ซึ่ง operator แก้ได้ด้วยการเขียนไฟล์เอง ถือว่ายอมรับได้เพราะเกิดได้ยาก (volume เขียนไม่ได้)
8. ล้างรหัส setup ออกจากหน่วยความจำ ปิด pool ชั่วคราว `getSharedDatabase()` จะอ่านไฟล์ใหม่ในคำขอถัดไป

URL ที่เขียนลงไฟล์สร้างจาก field ทีละตัวด้วย `encodeURIComponent` ไม่รับ URL ดิบจากผู้ใช้

### 6. Super admin

- เพิ่มบทบาท `super-admin` ใน `packages/core/src/access/policy.ts`
- เพิ่มฟังก์ชันบริสุทธิ์ `expandSuperAdmin(access)` ใน `packages/core/src/access` ถ้ามีบทบาท `super-admin` ให้คืน:
  - `roles`: ทุกบทบาทใน `permissionsByRole` แบบ `organizationId: null` รวมกับบทบาทเดิม
  - `dataOwnerModules` และ `hospitalWideDataOwnerModules`: ทุกโมดูลใน `dataOwnerModuleCodes` (รายการใหม่ใน policy: `hr`, `leave`, `official-travel`, `room-booking`, `inventory`, `requests`)
- `SessionService.resolve` เรียก `expandSuperAdmin` หลัง `AccessSubjectLoader.load` จุดเดียว ทุก policy เดิม (`AuthorizationService`, การเช็ก `roles`/`dataOwnerModules` ใน web) จึงเห็นสิทธิ์ครบโดยไม่ต้องแก้
- super admin **ไม่** กลายเป็นผู้อนุมัติแทนหัวหน้าในสายบังคับบัญชา (ผู้อนุมัติมาจาก `hr_organization_head` ไม่ใช่บทบาท) — เป็นพฤติกรรมที่ตั้งใจ
- ทุกการกระทำของ super admin ลงบันทึกการตรวจสอบเหมือนผู้ใช้อื่น
- เพิ่มคำ **ผู้ดูแลระบบสูงสุด (super admin)** ใน `CONTEXT.md`: บทบาทที่ได้สิทธิ์ทุกบทบาทและเป็นเจ้าของข้อมูลทุกโมดูลทั้งโรงพยาบาล ตั้งได้จากหน้า setup ครั้งแรกเท่านั้น

### 7. Worker

`apps/worker/src/main.ts` ใช้ลำดับการหาค่าเดียวกับข้อ 1 ถ้ายังไม่มีค่า ให้ log `backoffice.worker.waiting_for_database_config` ครั้งเดียว แล้วตรวจซ้ำทุก 10 วินาที แทนการ throw (เดิม throw แล้ว restart วน)

### 8. Infra

- `docker-compose.production.yml`:
  - volume ใหม่ `backoffice-config` mount ที่ `/var/lib/backoffice/config` — web แบบ `rw`, worker แบบ `ro`
  - เอา secret `database_url` และ `DATABASE_URL_FILE` ออกจากค่าบังคับ (`:?`) ผู้ที่ยังอยากใช้ไฟล์ secret ใส่ผ่าน override ได้
- ไฟล์ override ใหม่ `docker-compose.external-db.yml`: เพิ่ม network ที่ไม่ใช่ internal ให้ web และ worker ออกไปหาฐานข้อมูลนอก compose ได้ (backplane เดิมเป็น `internal: true`) และปิด service `mariadb` ในตัว (`profiles: [bundled-db]`)
- `infra/backup/backup.sh` สำรอง volume `backoffice-config` ด้วย (มีรหัสผ่านฐาน เก็บแบบเข้ารหัสเหมือน backup อื่น)
- web Docker image ต้องมีไฟล์ migration SQL (ตอนนี้ `migrate.ts` อ่านไฟล์จาก `../migrations` ซึ่ง Next standalone ไม่ได้ copy) — แก้ด้วย `outputFileTracingIncludes` หรือ copy ใน Dockerfile แล้วชี้ path ด้วย env; แผนจะเลือกแบบที่มี test พิสูจน์ได้
- อัปเดต `docs/runbooks/deploy.md` ส่วน "First-run setup" และ `local-setup.md` ถ้ากระทบ

## Security notes

- ใครเข้าหน้า setup ได้ต้องอ่าน log ของเซิร์ฟเวอร์ได้ ซึ่งเท่ากับมีสิทธิ์ operator อยู่แล้ว
- หน้า setup ปิดถาวรทันทีที่มีค่าเชื่อมฐาน ไม่มีทางเปิดกลับจากเว็บ
- รหัสผ่านฐาน, รหัสผ่าน admin, เลขบัตร, รหัส setup ไม่อยู่ใน URL, log, audit metadata, outbox หรือ response
- ผู้ใช้ฐานควรเป็นผู้ใช้เฉพาะแอป ไม่ใช่ root หน้า setup เตือนเมื่อชื่อผู้ใช้เป็น `root`
- ช่วงโหมด setup ควรสั้น ผู้ติดตั้งควรทำทันทีหลัง `docker compose up`

## Testing

Unit (Vitest):
- ลำดับการหาค่า `DATABASE_URL` (env > file > config dir > none)
- รหัส setup: รูปแบบ, เทียบถูก/ผิด, ครบ 5 ครั้งแล้วเปลี่ยนรหัส, ไม่เคยคืนรหัสจริง
- zod schema ของฟอร์ม: เลขบัตร checksum, รหัสผ่านสั้น, port นอกช่วง, host ว่าง
- `expandSuperAdmin`: มี/ไม่มี super-admin, ไม่ซ้ำบทบาท, ได้ทุก permission ใน `AuthorizationService`
- สร้าง URL: อักขระพิเศษในรหัสผ่านถูก encode
- route handler: นอกโหมด setup ตอบ 404, รหัสผิดตอบ `invalid_code`, error ของ driver ไม่หลุดไปใน response
- worker: ไม่มีค่าแล้วรอ ไม่ throw

Integration (MariaDB, ข้ามเมื่อไม่มี `DATABASE_URL`):
- ฐานว่าง: complete แล้วได้ migration ครบ 16, person/account/role/assignment/audit ครบ, ล็อกอินด้วยบัญชีใหม่ได้ และ session มีทุกบทบาท
- ฐานที่เตรียมด้วยสคริปต์ SQL + ผู้ใช้ DML อย่างเดียว: complete ผ่านโดยไม่รัน migration
- ฐานว่าง + ผู้ใช้ DML อย่างเดียว: ได้ `migration_privilege_missing`
- ฐานที่มีบัญชีแล้ว: ได้ `accounts_exist` และไม่มีแถวใหม่
- transaction ล้มกลางทาง: ไม่มีแถวค้าง

E2E (Playwright): เปิดเว็บโหมด setup → ไป `/setup` → กรอก → ล็อกอินด้วย super admin → เข้า `/hr` ได้ → `/setup` ตอบ 404

## Open questions

ไม่มี (ยืนยันแล้วในเธรด)
