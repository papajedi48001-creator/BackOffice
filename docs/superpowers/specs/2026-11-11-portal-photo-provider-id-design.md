# รูปโปรไฟล์บน portal หลังเข้าสู่ระบบด้วย Provider ID โดยตรง

Status: follow-up ของ `2026-11-10-provider-id-direct-design.md` (PR #87) และ `2026-11-10-portal-profile-photo-design.md` (PR #86)

## ปัญหา

หลัง #87 การผูกบัญชีใหม่เก็บใต้ issuer = Provider ID base URL (`https://provider.id.th` ใน prd) และ subject = `account_id`
แต่ `/api/portal/photo` หา `identity_link` ด้วย issuer ของ portal และรหัสสมาชิก portal (`sub`) จึงหารูปไม่เจอ
และ `docker-compose.provider-sso.yml` ไม่ส่ง `PROVIDER_SSO_*` ให้ web แล้ว route จึงตอบ 404 เสมอบนเครื่องที่ deploy

## พฤติกรรมใหม่

- portal (radius-server) ใส่ claim เพิ่มใน JWT คำขอรูป เมื่อสมาชิกมีบัญชี Provider ID ผูกอยู่ (`provider_external_identities`):
  - `provider_iss` = Provider ID base URL ของสภาพแวดล้อมนั้น (prd ก่อน ถ้าไม่มีจึงใช้ uat)
  - `provider_sub` = `account_id`
  - ทั้งสองมาด้วยกันหรือไม่มาเลย ไม่มี `hash_cid` ชื่อ หรือข้อมูลอื่น
- `PortalOidcClient.verifyPortalRequest` คืน `{ memberId, provider: { issuer, subject } | null }`
  claim ที่มาไม่ครบคู่ ไม่ใช่ string หรือยาวเกิน 255 ตัวอักษร ถือว่าคำขอไม่ถูกต้อง (401)
- route หา link ตามลำดับ
  1. ถ้ามี `provider` และ `provider.issuer` ตรงกับ Provider ID base URL ที่ Back Office ใช้เข้าสู่ระบบอยู่ (`providerSsoConfig().apiUrl`) หา link ของ issuer/subject นั้น
  2. ถ้าไม่เจอ หา link ของ issuer portal กับรหัสสมาชิก portal แบบเดิม (การผูกที่เคยทำผ่าน portal)
  - issuer ที่ไม่ตรงกับสภาพแวดล้อมของ Back Office ไม่ถูกใช้ (ไม่ข้ามไปหา link ของ uat เมื่อ Back Office ใช้ prd)
- คำตอบ 200/401/404/503 เหมือนเดิม

## การตั้งค่า

- `portalSsoConfig()` ต้องการเพียง `PROVIDER_SSO_ISSUER` และ `PROVIDER_SSO_CLIENT_ID` เพราะการตรวจคำขอใช้แค่ issuer, audience และ JWKS
  ไม่ต้องมี client secret หรือ redirect URI ของ portal อีก
- ไฟล์ใหม่ `infra/compose/docker-compose.portal-photo.yml` ใส่ต่อจาก `docker-compose.provider-sso.yml`:
  ส่ง `PROVIDER_SSO_ISSUER` (บังคับ), `PROVIDER_SSO_CLIENT_ID` (ค่าเริ่มต้น `backoffice`) และ pin ชื่อโฮสต์ portal เป็น IP ใน LAN (`extra_hosts`) เหมือนก่อน #87
  web ใช้ network `egress` เดิมเพื่อเรียก JWKS ของ portal ไม่มี service อื่นได้ค่าเหล่านี้

## ทางเลือกที่ไม่เลือก

- Back Office เรียก portal ถาม `account_id` ของสมาชิก: เพิ่ม endpoint และทางเรียกอีกทางโดยไม่จำเป็น
- ให้ portal ส่ง `account_id` แทน `sub`: ทำให้การผูกที่ทำผ่าน portal หารูปไม่เจอ และสับสนความหมายของ `sub`
