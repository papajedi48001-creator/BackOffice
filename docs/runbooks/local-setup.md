# ติดตั้งระบบบนเครื่องนักพัฒนา

คู่มือนี้ใช้ตั้งระบบ Back Office บนเครื่องนักพัฒนา (Windows, macOS, Linux) ด้วยสคริปต์ `scripts/setup-local.mjs` และเปิดให้เครื่องอื่นในวง LAN ทดลองใช้ ใช้กับข้อมูลสมมติเท่านั้น ห้ามใช้ข้อมูลบุคลากรหรือเลขบัตรประชาชนจริง

## สิ่งที่ต้องมี

| เครื่องมือ | รุ่น | หมายเหตุ |
|---|---|---|
| git | ใดก็ได้ | |
| Docker พร้อม Compose | Docker Desktop หรือ Docker Engine + compose plugin | ต้องเปิด Docker ไว้ก่อนรันสคริปต์ |
| Node.js | 24 | |
| pnpm | 11.19.0 | `npm install -g pnpm@11.19.0` |

## ติดตั้งครั้งแรก

```bash
git clone https://github.com/papajedi48001-creator/BackOffice.git
cd BackOffice
node scripts/setup-local.mjs
```

สคริปต์จะ:

1. ตรวจเครื่องมือข้างบน แล้วบอกว่าขาดอะไร
2. รัน `pnpm install --frozen-lockfile`
3. ตรวจว่าพอร์ตที่ต้องใช้ว่าง (ดู "พอร์ตชน")
4. สร้าง `.env` จาก `.env.example` พร้อมสุ่ม `BACKOFFICE_SESSION_SECRET`, `NATIONAL_ID_ENCRYPTION_KEY`, `NATIONAL_ID_LOOKUP_KEY` ใหม่ ถ้ามี `.env` อยู่แล้วจะไม่เขียนทับ
5. เปิด MariaDB และ Redis ด้วย `infra/compose/docker-compose.dev.yml` (เพิ่ม `--with-minio` ถ้าต้องการที่เก็บไฟล์แนบ)
6. รอฐานข้อมูลพร้อมแล้วรัน migration
7. รัน `seed:demo` ถ้าสาขานั้นมีสคริปต์นี้ เพื่อสร้างหน่วยงาน บุคลากร และบัญชีทดลอง

`.env` อยู่ใน `.gitignore` ห้าม commit และห้ามคัดลอกคีย์ในไฟล์นี้ไปใช้ที่อื่น

## เปิดระบบ

เปิดสองหน้าต่าง terminal:

```bash
node scripts/setup-local.mjs web      # build แล้วเปิดเว็บที่ http://localhost:3000 (ใส่ --no-build เพื่อข้ามการ build)
node scripts/setup-local.mjs worker   # ส่งการแจ้งเตือนจาก outbox
```

ทั้งสองคำสั่งโหลดค่าจาก `.env` ให้เอง

## บัญชีทดลอง

`seed:demo` สร้างบัญชีให้บุคลากรสมมติทุกคน ชื่อผู้ใช้คือรหัสพนักงานตัวพิมพ์เล็ก รหัสผ่านคือค่า `DEMO_PASSWORD` (ค่าเริ่มต้น `demo-password-2569`)

| ชื่อผู้ใช้ | บทบาทที่ได้รับ | ใช้ทดลอง |
|---|---|---|
| `hr001` | `hr-manager` + เจ้าของข้อมูลโมดูล HR | จัดการบุคลากร หน่วยงาน นำเข้าข้อมูล และตั้งค่าการลา (ประเภทการลา สิทธิ์การลา วันหยุด ยอดวันลายกมา) |
| `adm003` | `room-manager`, `room-booking-approver`, `inventory-officer` | จัดการห้องประชุม อนุมัติการจองห้อง และเป็นเจ้าหน้าที่พัสดุ (ทะเบียนวัสดุ ยอดยกมา รับเข้า ฉลาก QR) |
| `nur001` | หัวหน้าของ `nur014` และ `nur022` และหัวหน้ากลุ่มการพยาบาล | อนุมัติคำขอและใบลาที่ลูกทีมส่งมา (เลือกอนุมัติหลายใบพร้อมกันได้) และดูปฏิทินการลา |
| `nur014`, `nur022` | บุคลากรทั่วไป | ส่งคำขอและยื่นใบลา (ส่งต่อไปที่ `nur001`) |

บุคลากรสมมติทุกคนเป็นข้าราชการ วันบรรจุ 1 มิถุนายน 2558 จึงยื่นใบลาได้ทุกประเภทตั้งแต่ครั้งแรก
| `dir001` | `inventory-supervisor` + หัวหน้าหน่วยงานระดับโรงพยาบาล | หัวหน้างานพัสดุ: รับรองยอดยกมา และดูยอดคงเหลือ; ผู้อนุมัติสุดท้ายของลาพักผ่อน |
| `lab002`, `pha005` | บุคลากรทั่วไป | ส่งคำขอ จองห้อง ดูการแจ้งเตือน |

ถ้าสาขาที่ใช้ยังไม่มี `seed:demo` สคริปต์จะแจ้งว่ายังไม่ได้สร้างบัญชี ให้ดึง `main` ล่าสุดแล้วรัน `node scripts/setup-local.mjs` อีกครั้ง

## พอร์ตชน

ค่าเริ่มต้นคือ MariaDB `3307`, Redis `6379`, MinIO `9000`/`9001`, เว็บ `3000` และ HTTPS สำหรับ LAN `8443` ถ้าพอร์ตไหนมีโปรแกรมอื่นใช้อยู่ สคริปต์จะหยุดและบอกตัวแปรที่ต้องตั้ง

ก่อนติดตั้งครั้งแรก ตั้งตัวแปรแล้วรันใหม่:

```bash
BACKOFFICE_DB_PORT=3310 BACKOFFICE_REDIS_PORT=6390 node scripts/setup-local.mjs
```

PowerShell:

```powershell
$env:BACKOFFICE_DB_PORT = '3310'; $env:BACKOFFICE_REDIS_PORT = '6390'; node scripts/setup-local.mjs
```

ถ้ามี `.env` แล้ว ให้แก้บรรทัด `BACKOFFICE_*_PORT` และพอร์ตใน `DATABASE_URL` / `REDIS_URL` ให้ตรงกัน

ถ้าเครื่องเดียวต้องรันหลายชุด (เช่นหลาย clone) ให้ใส่ `COMPOSE_PROJECT_NAME=<ชื่อ>` ใน `.env` ของแต่ละชุด เพื่อแยก container และ volume ออกจากกัน

## ให้เครื่องอื่นใน LAN เปิดระบบ

คุกกี้ล็อกอินตั้งเป็น `Secure` เมื่อ `NODE_ENV=production` จึงใช้ผ่าน `http://<IP>:3000` ไม่ได้ ให้เปิดผ่าน HTTPS ด้วย Caddy (profile `lan`) ซึ่งออกใบรับรองจาก CA ภายในของ Caddy เอง

1. เปิดเว็บก่อน: `node scripts/setup-local.mjs web`
2. เปิด HTTPS:

   ```bash
   node scripts/setup-local.mjs lan
   ```

   สคริปต์เลือก IP ของการ์ดเครือข่ายจริงให้และพิมพ์ URL เช่น `https://192.168.1.20:8443` ถ้าเลือกผิด ให้ตั้ง `BACKOFFICE_LAN_HOST=<IP>` แล้วรันใหม่
3. อนุญาตพอร์ต 8443 ใน firewall ของเครื่องที่รันระบบ เจ้าของเครื่องต้องทำเอง เช่นบน Windows ให้เปิด PowerShell แบบ Administrator:

   ```powershell
   New-NetFirewallRule -DisplayName "BackOffice LAN HTTPS" -Direction Inbound -Protocol TCP -LocalPort 8443 -Action Allow -Profile Private
   ```

   ปิดเมื่อเลิกใช้: `Remove-NetFirewallRule -DisplayName "BackOffice LAN HTTPS"`
4. เครื่องอื่นเปิด URL นั้น ครั้งแรกเบราว์เซอร์จะเตือนว่าใบรับรองไม่น่าเชื่อถือ (เพราะเป็น CA ภายใน) ให้กดดำเนินการต่อ

ปิด HTTPS: `docker compose -f infra/compose/docker-compose.dev.yml --profile lan stop https-lan`

ใช้เฉพาะวงเครือข่ายที่ไว้ใจได้ และใช้กับข้อมูลสมมติเท่านั้น

## ทดสอบสคริปต์

```bash
node --test scripts/setup-local-lib.test.mjs scripts/local-compose.test.mjs
```

`local-compose.test.mjs` ข้ามการตรวจไฟล์ compose ถ้าเครื่องไม่มี `docker compose`

## ปัญหาที่พบบ่อย

| อาการ | สาเหตุและวิธีแก้ |
|---|---|
| `Ports already in use` | ดู "พอร์ตชน" |
| `MariaDB did not become ready` | ดู log: `docker compose -f infra/compose/docker-compose.dev.yml logs mariadb` |
| ดึง image MinIO จาก quay.io ไม่ได้ (401) | ข้าม MinIO ได้ (ค่าเริ่มต้นไม่เปิด) ส่วนแนบไฟล์จะใช้ไม่ได้ |
| เครื่องอื่นเปิด URL แล้วค้างหรือ connection refused | ยังไม่ได้อนุญาตพอร์ตใน firewall หรือใช้ IP ผิดการ์ด |
| ล็อกอินผ่าน `http://<IP>:3000` แล้วเด้งกลับหน้าแรก | คุกกี้ `Secure` ส่งผ่าน http ไม่ได้ ให้ใช้ URL HTTPS จาก `lan` |
