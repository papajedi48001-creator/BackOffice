# เข้าสู่ระบบด้วย Provider ID

บุคลากรเข้าสู่ระบบ Back Office ด้วย Provider ID ผ่าน portal ของ radius-server (`https://aut-waritch-hosp.moph.go.th`) ซึ่งทำหน้าที่ OpenID Provider
(OIDC authorization code + PKCE, ID token ลงนาม ES256) ชื่อผู้ใช้และรหัสผ่าน Back Office ยังใช้ได้ตามเดิม
ปุ่ม **เข้าสู่ระบบด้วย Provider ID** ขึ้นที่หน้าเข้าสู่ระบบก็ต่อเมื่อตั้งค่าครบทั้ง 4 ค่าด้านล่าง

ออกแบบไว้ที่ `docs/superpowers/specs/2026-11-09-provider-id-sso-design.md`

## 1. เปิดฝั่ง portal (radius-server)

ทำตาม `docs/backoffice-sso-runbook.md` ใน repo radius-server: ติดตั้งคำสั่ง ลงทะเบียน client `backoffice` ด้วย redirect URI
`https://<โฮสต์ Back Office>/api/auth/provider/callback` (ต้องเป็น https และตรงตัว) และเปิดให้เครื่องผู้ใช้กับเครื่อง Back Office เข้าถึง portal ได้

client secret สุ่มอย่างน้อย 32 ตัวอักษร เช่น `openssl rand -base64 48 > /etc/backoffice/provider-sso.secret` แล้ว `chmod 600`
ห้ามวาง secret ในเอกสาร แชต Git command line หรือ log

## 2. ตั้งค่าฝั่ง Back Office

เพิ่มใน `.env` ที่ราก repo (หรือ environment ของ container เว็บ):

```
PROVIDER_SSO_ISSUER=https://aut-waritch-hosp.moph.go.th
PROVIDER_SSO_CLIENT_ID=backoffice
PROVIDER_SSO_CLIENT_SECRET_FILE=/etc/backoffice/provider-sso.secret
PROVIDER_SSO_REDIRECT_URI=https://<โฮสต์ Back Office>/api/auth/provider/callback
```

`PROVIDER_SSO_REDIRECT_URI` ต้องตรงกับค่าที่ลงทะเบียนใน portal ทุกตัวอักษร ใช้ `PROVIDER_SSO_CLIENT_SECRET` แทนไฟล์ได้เฉพาะเครื่องนักพัฒนา

เปิดเว็บใหม่ แล้วตรวจ:

- จากเครื่อง Back Office: `curl -s https://aut-waritch-hosp.moph.go.th/.well-known/openid-configuration` ได้ JSON ที่มี `ES256`
- หน้าเข้าสู่ระบบมีปุ่ม **เข้าสู่ระบบด้วย Provider ID**

### เว็บที่รันใน Docker (production หรือ staging)

container web ไม่อ่าน `.env` ที่ราก repo ให้ใช้ไฟล์ override `infra/compose/docker-compose.provider-sso.yml` ซึ่งทำ 3 อย่าง ส่งค่าข้างต้นเข้า container,
อ่าน client secret จาก Docker secret และให้ container ออกไปเรียก portal ได้ (ชื่อ `aut-waritch-hosp.moph.go.th` ชี้ไปที่ `192.168.1.10` ใน container
เปลี่ยนได้ด้วย `PROVIDER_SSO_PORTAL_HOST` / `PROVIDER_SSO_PORTAL_IP`) ไม่ใส่ไฟล์นี้ = ปุ่มไม่ขึ้นเหมือนเดิม

1. เก็บ client secret ตัวเดียวกับที่ลงทะเบียนใน portal เป็นไฟล์ mode `0600` เหมือน secret อื่น เช่น `/etc/backoffice/secrets/provider_sso_client_secret`
2. เพิ่มใน environment file ของ Compose (`/etc/backoffice/production.env` หรือ `/etc/backoffice/staging.env`):
   ```
   PROVIDER_SSO_ISSUER=https://aut-waritch-hosp.moph.go.th
   PROVIDER_SSO_REDIRECT_URI=https://office-waritch-hosp.moph.go.th/api/auth/provider/callback
   PROVIDER_SSO_CLIENT_SECRET_FILE=/etc/backoffice/secrets/provider_sso_client_secret
   ```
3. ใส่ `-f infra/compose/docker-compose.provider-sso.yml` ต่อท้ายไฟล์ compose เดิมทุกคำสั่ง เช่น staging ที่ใช้ nginx ร่วม (เครื่อง .251):
   ```sh
   docker compose --env-file /etc/backoffice/staging.env \
     -f infra/compose/docker-compose.staging.yml \
     -f infra/compose/docker-compose.staging-shared-nginx.yml \
     -f infra/compose/docker-compose.provider-sso.yml up -d web
   ```
4. ตรวจจากใน container: `docker compose ... exec web node -e "fetch('https://aut-waritch-hosp.moph.go.th/oidc/jwks').then(r=>console.log(r.status))"` ต้องได้ `200`
   ถ้าได้ error ให้ตรวจว่า IP ของเครื่องที่รัน Docker อยู่ใน `/etc/nginx/hospital-portal-allow.conf` ของ portal

portal ลงทะเบียน redirect URI ได้ค่าเดียว ถ้าย้ายเครื่อง (เช่นทดสอบที่เครื่องหนึ่งแล้วย้ายไป .251) ให้รัน `hospital-backoffice-sso-config set` ใหม่ด้วย redirect URI ของเครื่องใหม่

## 3. ผูกบัญชี

บัญชี Provider ID หนึ่งบัญชีผูกกับบุคลากรได้หนึ่งคน และบุคลากรหนึ่งคนผูกได้หนึ่งบัญชี Provider ID

- **บุคลากรผูกเอง**: ครั้งแรกที่เข้าด้วย Provider ID ระบบพาไปหน้า **ผูกบัญชี Provider ID** ให้กรอกชื่อผู้ใช้และรหัสผ่าน Back Office หนึ่งครั้ง
  (มีเวลา 10 นาที ใช้การจำกัดการเดารหัสผ่านเดียวกับหน้าเข้าสู่ระบบ) ครั้งต่อไปเข้าได้ทันที
- **ผู้ดูแลระบบผูกให้**: คนที่ไม่มีรหัสผ่าน Back Office ให้ลองเข้าด้วย Provider ID หนึ่งครั้ง ชื่อจะขึ้นในรายการ **รอผูกบัญชี**
  ที่ **ผู้ดูแลระบบ > บัญชี Provider ID** แล้วกด **ผูกบัญชี** เลือกบุคลากร
- **ยกเลิกการผูก**: ที่หน้าเดียวกัน กด **ยกเลิกการผูก** และใส่เหตุผล ระบบออกจากระบบทุก session ของบุคลากรคนนั้นทันที

ทุกการผูก ยกเลิก และเข้าสู่ระบบที่ไม่สำเร็จ ถูกบันทึกใน audit (`identity.provider_link`, `identity.provider_unlink`, `identity.provider_login`)
เหตุผลการยกเลิกเก็บแยกในตาราง `identity_link_removal` ไม่อยู่ใน audit metadata

## 4. ข้อควรรู้

- ระบบออก code ให้เฉพาะสมาชิก portal ที่สถานะ `approved` และตรวจซ้ำตอนแลก token บุคลากรที่ถูกปิดใช้งานใน Back Office เข้าไม่ได้แม้ Provider ID ยังใช้ได้
- เครื่องใช้ร่วม: ถ้า portal ยังมี session ค้างอยู่ คนถัดไปที่กดปุ่มจะเข้าเป็นเจ้าของ session นั้นโดยไม่ต้องยืนยันตัวตนใหม่
  (ตัดสินใจรับความเสี่ยงนี้แล้ว) ให้ออกจากระบบ portal ทุกครั้งบนเครื่องใช้ร่วม
- portal หมุนกุญแจลงนามได้โดยไม่ต้องแก้ Back Office: เว็บเก็บ JWKS 10 นาที และดึงใหม่ทันทีเมื่อพบ `kid` ที่ไม่รู้จัก

## ปิดทันที

ลบ 4 ค่าใน `.env` แล้วเปิดเว็บใหม่ ปุ่มหาย ทุกคนใช้ชื่อผู้ใช้และรหัสผ่านตามเดิม การผูกบัญชีที่มีอยู่ยังเก็บไว้ หรือปิดฝั่ง portal ตาม runbook ของ radius-server
(กดปุ่มแล้วหน้าเข้าสู่ระบบจะแจ้งว่า "ระบบ Provider ID ไม่พร้อมใช้งาน")

## ปัญหาที่พบบ่อย

| อาการ | สาเหตุและวิธีแก้ |
|---|---|
| ไม่มีปุ่ม Provider ID | ตั้งค่าไม่ครบ 4 ค่า หรืออ่านไฟล์ secret ไม่ได้ (สิทธิ์ไฟล์) |
| "ระบบ Provider ID ไม่พร้อมใช้งาน" | เครื่อง Back Office เรียก portal ไม่ถึง (DNS, certificate, allowlist ของ nginx) หรือ client secret ไม่ตรง ดู log เว็บบรรทัด `provider sign-in failed` |
| "เข้าสู่ระบบด้วย Provider ID ไม่สำเร็จ" | ใช้เกิน 10 นาที เปิดสองแท็บพร้อมกัน หรือ code ถูกใช้แล้ว ให้กดปุ่มใหม่ ดู audit `identity.provider_login` ช่อง `stage` |
| portal ตอบ `redirect_uri` ไม่ถูกต้อง | ค่า `PROVIDER_SSO_REDIRECT_URI` ไม่ตรงกับที่ลงทะเบียน |
