# เข้าสู่ระบบด้วย Provider ID

บุคลากรเข้าสู่ระบบ Back Office ด้วย Provider ID ได้จากทุกที่ Back Office ต่อ MOPH ID (`moph.id.th`) และ Provider ID (`provider.id.th`) ของกระทรวงเอง
แบบเดียวกับที่ portal ของ radius-server ทำ ไม่ผ่าน portal เพราะ portal เปิดเฉพาะในโรงพยาบาล (ADR 0006 ของ radius-server) ชื่อผู้ใช้และรหัสผ่าน Back Office ยังใช้ได้ตามเดิม
ปุ่ม **เข้าสู่ระบบด้วย Provider ID** ขึ้นที่หน้าเข้าสู่ระบบก็ต่อเมื่อตั้งค่าครบตามข้อ 2

ออกแบบไว้ที่ `docs/superpowers/specs/2026-11-10-provider-id-direct-design.md`

## 1. ลงทะเบียน callback กับกระทรวง

ลงทะเบียน callback ค่าเดียวกันกับทั้ง Health ID (MOPH ID) และ Provider ID เหมือนที่ทำให้ radius-server:

`https://office-waritch-hosp.moph.go.th/api/auth/provider/callback`

ใช้ client PRD เดิมของ radius-server ได้ถ้าเพิ่ม callback ต่อจากของ `aut-waritch-hosp` ได้ ห้ามลบ callback เดิมเพราะการเข้า Wi-Fi ผ่าน portal ใช้อยู่
ถ้าเพิ่มไม่ได้ให้ขอ client ใหม่ทั้งสองบริการ ค่า secret ของ radius-server อยู่ที่ `/etc/hospital-provider-id/health-prd.client-secret` และ `provider-prd.client-secret` บนเครื่อง .10
ห้ามวาง secret ในเอกสาร แชต Git command line หรือ log

## 2. ตั้งค่าฝั่ง Back Office

| ค่า | ความหมาย |
|---|---|
| `PROVIDER_ID_ENV` | `prd` (ค่าเริ่มต้น) หรือ `uat` |
| `PROVIDER_ID_HEALTH_CLIENT_ID` | Client ID ของ MOPH ID |
| `PROVIDER_ID_HEALTH_CLIENT_SECRET_FILE` | ไฟล์ secret ของ MOPH ID |
| `PROVIDER_ID_CLIENT_ID` | Client ID ของ Provider ID |
| `PROVIDER_ID_SECRET_KEY_FILE` | ไฟล์ secret key ของ Provider ID |
| `PROVIDER_ID_REDIRECT_URI` | callback ในข้อ 1 ตรงทุกตัวอักษร |

ใช้ `PROVIDER_ID_HEALTH_CLIENT_SECRET` / `PROVIDER_ID_SECRET_KEY` แทนไฟล์ได้เฉพาะเครื่องนักพัฒนา `PROVIDER_ID_HEALTH_URL` และ `PROVIDER_ID_API_URL` มีไว้ให้ e2e ชี้ไปที่ตัวจำลองเท่านั้น

### เว็บที่รันใน Docker (production หรือ staging)

ใช้ไฟล์ override `infra/compose/docker-compose.provider-sso.yml` ซึ่งส่งค่าข้างต้นเข้า container web, อ่าน secret ทั้งสองจาก Docker secret
และให้เฉพาะ web ออก HTTPS ไปที่กระทรวงผ่าน network `egress` ไม่ใส่ไฟล์นี้ = ปุ่มไม่ขึ้น

1. คัดลอก secret ทั้งสองเป็นไฟล์ root mode `0600` เช่น `/etc/backoffice/secrets/provider_id_health_client_secret` และ `/etc/backoffice/secrets/provider_id_secret_key`
   จากเครื่อง .10 ให้ใช้ `scp` ของไฟล์ ไม่พิมพ์ค่าในหน้าจอ
2. เพิ่มใน environment file ของ Compose (`/etc/backoffice/staging.env` หรือ `/etc/backoffice/production.env`):
   ```
   PROVIDER_ID_ENV=prd
   PROVIDER_ID_HEALTH_CLIENT_ID=<Client ID ของ MOPH ID>
   PROVIDER_ID_CLIENT_ID=<Client ID ของ Provider ID>
   PROVIDER_ID_REDIRECT_URI=https://office-waritch-hosp.moph.go.th/api/auth/provider/callback
   PROVIDER_ID_HEALTH_CLIENT_SECRET_FILE=/etc/backoffice/secrets/provider_id_health_client_secret
   PROVIDER_ID_SECRET_KEY_FILE=/etc/backoffice/secrets/provider_id_secret_key
   # ช่วงที่จัดสรรแล้วและไม่ทับวงเครือข่ายโรงพยาบาล (ห้ามใช้ 172.18.0.0/16)
   BACKOFFICE_EGRESS_SUBNET=10.250.255.0/24
   ```
3. ใส่ `-f infra/compose/docker-compose.provider-sso.yml` ต่อท้ายไฟล์ compose เดิมทุกคำสั่ง รวมถึงสคริปต์ deploy อัตโนมัติ ไม่อย่างนั้นปุ่มจะหายเมื่อ deploy รอบถัดไป
4. ตรวจจากใน container: `docker compose ... exec web node -e "fetch('https://moph.id.th').then(r=>console.log(r.status)).catch(e=>console.log(e.cause?.code||e.message))"`
   ต้องได้เลข HTTP (เช่น 200 หรือ 302) ถ้าได้ `ENOTFOUND` หรือ `ETIMEDOUT` ให้ตรวจ DNS และ firewall ขาออกของเครื่อง

## 3. ผูกบัญชี

บัญชี Provider ID หนึ่งบัญชีผูกกับบุคลากรได้หนึ่งคน และบุคลากรหนึ่งคนผูกได้หนึ่งบัญชี Provider ID

- **บุคลากรผูกเอง**: ครั้งแรกที่เข้าด้วย Provider ID ระบบพาไปหน้า **ผูกบัญชี Provider ID** ให้กรอกชื่อผู้ใช้และรหัสผ่าน Back Office หนึ่งครั้ง
  (มีเวลา 10 นาที ใช้การจำกัดการเดารหัสผ่านเดียวกับหน้าเข้าสู่ระบบ) ครั้งต่อไปเข้าได้ทันที
- **ผู้ดูแลระบบผูกให้**: คนที่ไม่มีรหัสผ่าน Back Office ให้ลองเข้าด้วย Provider ID หนึ่งครั้ง ชื่อจะขึ้นในรายการ **รอผูกบัญชี**
  ที่ **ผู้ดูแลระบบ > บัญชี Provider ID** แล้วกด **ผูกบัญชี** เลือกบุคลากร
- **ยกเลิกการผูก**: ที่หน้าเดียวกัน กด **ยกเลิกการผูก** และใส่เหตุผล ระบบออกจากระบบทุก session ของบุคลากรคนนั้นทันที

ทุกการผูก ยกเลิก และเข้าสู่ระบบที่ไม่สำเร็จ ถูกบันทึกใน audit (`identity.provider_link`, `identity.provider_unlink`, `identity.provider_login`)
เหตุผลการยกเลิกเก็บแยกในตาราง `identity_link_removal` ไม่อยู่ใน audit metadata

## 4. รูปโปรไฟล์บน dashboard ของ portal

portal แสดงรูปโปรไฟล์ Back Office ของบุคลากรที่ผูกบัญชีแล้ว โดยเครื่อง portal เรียก `GET https://<โฮสต์ Back Office>/api/portal/photo`
พร้อม JWT ที่ลงนามด้วยกุญแจ SSO ของ portal (ดู `docs/superpowers/specs/2026-11-10-portal-profile-photo-design.md`) ใช้ได้เมื่อตั้ง `PROVIDER_SSO_ISSUER`, `PROVIDER_SSO_CLIENT_ID`,
`PROVIDER_SSO_CLIENT_SECRET(_FILE)` และ `PROVIDER_SSO_REDIRECT_URI` ของ portal ไว้ด้วย การเข้าสู่ระบบไม่ได้ใช้ค่าเหล่านี้แล้ว
ข้อจำกัดตอนนี้: รูปหาได้เฉพาะบัญชีที่เคยผูกผ่าน portal เพราะการผูกที่ทำผ่าน MOPH ID โดยตรงเก็บ `account_id` ไม่ใช่รหัสสมาชิก portal
แต่เครื่อง portal ต้องเรียกโฮสต์ Back Office ทาง https ได้ ถ้าเรียกไม่ได้ dashboard แสดงรูปการ์ตูนเดิม

ตรวจจากเครื่อง portal: `curl -s -o /dev/null -w '%{http_code}\n' https://<โฮสต์ Back Office>/api/portal/photo` ต้องได้ `401` (ไม่มี token)

## 5. ข้อควรรู้

- ระบบเก็บเฉพาะ `account_id` และชื่อ-สกุลจาก Provider ID ไม่เก็บ `hash_cid` หน่วยงาน หรือตำแหน่ง
- บุคลากรที่ถูกปิดใช้งานใน Back Office เข้าไม่ได้แม้ Provider ID ยังใช้ได้
- การผูกบัญชีเก็บแยกตามสภาพแวดล้อม เปลี่ยน `PROVIDER_ID_ENV` จาก `uat` เป็น `prd` แล้วต้องผูกใหม่ การผูกที่เคยทำผ่าน portal ของ radius-server ใช้ไม่ได้แล้ว
- เครื่องใช้ร่วม: ถ้า MOPH ID ยังมี session ค้างอยู่ คนถัดไปที่กดปุ่มอาจเข้าเป็นเจ้าของ session นั้น ให้ออกจากระบบ MOPH ID ทุกครั้งบนเครื่องใช้ร่วม

## ปิดทันที

ลบค่า `PROVIDER_ID_*` หรือเอา `-f infra/compose/docker-compose.provider-sso.yml` ออก แล้วเปิดเว็บใหม่ ปุ่มหาย ทุกคนใช้ชื่อผู้ใช้และรหัสผ่านตามเดิม การผูกบัญชีที่มีอยู่ยังเก็บไว้

## ปัญหาที่พบบ่อย

| อาการ | สาเหตุและวิธีแก้ |
|---|---|
| ไม่มีปุ่ม Provider ID | ตั้งค่าไม่ครบ อ่านไฟล์ secret ไม่ได้ หรือ `PROVIDER_ID_ENV` ไม่ใช่ `prd`/`uat` |
| MOPH ID ตอบว่า redirect_uri ไม่ถูกต้อง | ยังไม่ได้ลงทะเบียน callback ในข้อ 1 หรือ `PROVIDER_ID_REDIRECT_URI` ไม่ตรง |
| "ระบบ Provider ID ไม่พร้อมใช้งาน" | container เรียก `moph.id.th` หรือ `provider.id.th` ไม่ถึง หรือบริการของกระทรวงขัดข้อง ดู log เว็บบรรทัด `provider sign-in failed` |
| "เข้าสู่ระบบด้วย Provider ID ไม่สำเร็จ" | ใช้เกิน 10 นาที เปิดสองแท็บพร้อมกัน code ถูกใช้แล้ว secret ไม่ตรง หรือบัญชีไม่มี Provider ID ให้กดปุ่มใหม่ ดู audit `identity.provider_login` ช่อง `stage` |
