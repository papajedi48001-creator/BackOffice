# คง API รูปบุคลากรสำหรับ portal ตามสัญญา (`GET /api/portal/photo`)

วันที่: 2026-11-13 · ผู้ขอ: wasan · ต่อจาก PR #86 และ `2026-11-11-portal-photo-provider-id-design.md`

## เจตนา

portal เรียก `GET <ลิงก์ BackOffice>/api/portal/photo` อยู่แล้ว ไม่สร้าง API ใหม่ ต้องคง API นี้ให้ตรงสัญญาด้านล่าง
แก้ได้เฉพาะแบบที่ยังเข้ากันได้ และล็อกพฤติกรรมด้วยเทสต์สัญญา (contract tests) ที่เซ็น JWT จริง

## สัญญา (จากผู้ใช้)

- Request: `Authorization: Bearer <JWT>`, `Accept: image/jpeg, image/png, image/webp`, ไม่มี query string, ไม่มีเลขบัตร
- JWT ES256 เซ็นด้วยกุญแจ OIDC ของ portal: header `alg=ES256`, `kid` ใน JWKS, `typ=backoffice-photo-request+jwt`;
  claims `iss` = issuer ของ portal, `aud` = `backoffice`, `sub` = รหัสสมาชิก portal, `iat`, `exp` = iat + 60,
  `provider_iss` + `provider_sub` เมื่อผูกบัญชี Provider ID แล้ว
- BackOffice ตรวจลายเซ็นกับ `<portal>/.well-known/jwks.json` และ typ, iss, aud, exp (อายุไม่เกิน 120 วินาที);
  หาบุคลากรจาก identity link ด้วย `provider_iss` + `provider_sub`
- ตอบ `200` + `Content-Type: image/jpeg|png|webp` + รูป ≤ 2 MB; `404` ไม่พบคนหรือไม่มีรูป; `401` token ไม่ถูกต้อง;
  ห้าม redirect; ตอบภายใน 3 วินาที

## สิ่งที่โค้ดเดิมยังไม่ตรง และการแก้ (เข้ากันได้ย้อนหลังทั้งหมด)

| จุด | เดิม | แก้ |
|---|---|---|
| JWKS | `<issuer>/oidc/jwks` | ลอง `<issuer>/.well-known/jwks.json` ก่อน ไม่ได้ (เรียกไม่ได้ / ไม่ใช่ JSON / ไม่มี `keys`) ค่อยใช้ `/oidc/jwks` และจำ URL ที่ใช้ได้ล่าสุดไว้ |
| เวลา | ดึง JWKS รอได้ 10 วินาที | ไคลเอนต์ของ portal request ใช้ timeout ต่อครั้ง 1 วินาที และ route มีเพดานรวม 2.5 วินาที เกินแล้วตอบ `503` |
| `aud` | ต้องตั้ง `PROVIDER_SSO_CLIENT_ID` ไม่งั้น 404 | ค่าเริ่มต้น `backoffice` (ตรงกับ runbook และ compose) ยังตั้งค่าอื่นได้ |
| ขนาด/ชนิดรูป | กันเฉพาะตอนอัปโหลด | ตอนส่งด้วย: เกิน 2 MB หรือไม่ใช่ jpeg/png/webp ตอบ `404` |

คงเดิม: `503` เมื่อระบบไฟล์/ฐานข้อมูลหรือ JWKS ใช้ไม่ได้ (นอกสัญญา portal แสดงรูปตั้งต้น), การ fallback ไปการผูกผ่าน portal (`iss`+`sub`)
เมื่อบัญชี Provider ID ยังไม่ผูก, ไม่สนใจ `provider_iss` ของสภาพแวดล้อมอื่น, `cache-control: no-store`, `nosniff`

## Approaches

1. **แก้ในที่ + เทสต์สัญญา end-to-end (เลือก)**: แก้ `PortalOidcClient` และ route เล็กน้อย, เทสต์เซ็น JWT จริงผ่าน `PortalOidcClient` ตัวจริงเข้า `GET`
2. ใช้ OIDC discovery (`/.well-known/openid-configuration` → `jwks_uri`): เพิ่มคำขออีกครั้งและเวลา ทั้งที่สัญญาระบุ URL ไว้แล้ว
3. เทสต์อย่างเดียวไม่แก้: ไม่ผ่านข้อ JWKS URL และ 3 วินาที

## Non-goals

ไม่เปลี่ยน path, ไม่รับ query string เพิ่ม, ไม่ audit ทุกครั้งที่ดูรูป, ไม่ย่อรูป
