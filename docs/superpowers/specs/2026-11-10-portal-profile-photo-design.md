# รูปโปรไฟล์ Back Office บน dashboard ของ portal

ผู้ใช้ขอ (2026-11-10) ให้ dashboard ของ portal (radius-server) แสดงรูปโปรไฟล์ของบุคลากรจาก Back Office แทนรูปการ์ตูนเดียวกันทุกคน

## พฤติกรรม

- portal ขอรูปแบบ server-to-server ที่ `GET /api/portal/photo` ไม่ใช้ session ของเบราว์เซอร์ และ portal ไม่ต่อฐานข้อมูลหรือ object storage ของ Back Office
- คำขอมี `Authorization: Bearer <JWT>` ที่ portal ลงนามด้วยกุญแจ ES256 เดียวกับ ID token ของ Provider ID SSO
  - header `typ: backoffice-photo-request+jwt` (ID token ใช้ `typ: JWT` และต้องมี nonce จึงสลับกันใช้ไม่ได้)
  - `iss` = `PROVIDER_SSO_ISSUER`, `aud` = `PROVIDER_SSO_CLIENT_ID`, `sub` = รหัสสมาชิก portal, อายุไม่เกิน 120 วินาที
  - ตรวจกับ JWKS ของ portal ผ่าน `PortalOidcClient.verifyPortalRequest` (ใช้ cache และการดึงใหม่เมื่อเจอ `kid` ใหม่ร่วมกับการเข้าสู่ระบบ)
- Back Office หา `identity_link` ของ issuer และ `sub` นั้น ตรวจว่าบุคลากรยังปฏิบัติงาน แล้วส่งรูปปัจจุบัน (`hr_person_profile.photo_attachment_id`)
- คำตอบ: 200 พร้อมไบต์ของรูป (`cache-control: no-store`), 401 token ไม่ถูกต้อง, 404 ไม่ได้ตั้ง SSO / ยังไม่ผูกบัญชี / ไม่ปฏิบัติงาน / ไม่มีรูป,
  503 ฐานข้อมูล object storage หรือ JWKS ใช้ไม่ได้
- ไม่บันทึก audit ทุกครั้งที่ดู เหมือนรูปโปรไฟล์ภายใน Back Office ไม่มี token หรือรหัสใดอยู่ใน URL หรือ log

## ทางเลือกที่ไม่เลือก

- portal อ่าน MariaDB และ SeaweedFS ของ Back Office เอง: ต้องเปิดฐานข้อมูลข้ามเครื่องและแจก secret ของ S3 ให้ portal
- ใช้ client secret ยืนยัน: portal เก็บเพียง hash ของ secret จึงส่ง secret เองไม่ได้
