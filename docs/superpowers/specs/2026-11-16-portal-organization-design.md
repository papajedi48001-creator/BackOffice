# หน่วยงานสำหรับใบสมัครสมาชิก portal

วันที่ 2026-11-16 · ผู้ใช้เลือกให้ portal ดึงหน่วยงานจาก Back office มาเติมใบสมัคร และให้ส่ง hash_cid เพื่อหาบุคลากรที่ยังไม่เคยเข้า Back office

## พฤติกรรม

- `GET /api/portal/organization` รับเฉพาะ JWT ที่ portal ลงนาม (`typ: backoffice-organization-request+jwt`) ตรวจแบบเดียวกับ `/api/portal/photo`
- claims: `sub` (สมาชิก portal), `provider_iss` + `provider_sub` (ถ้ามี), `hash_cid` (ถ้ามี, 64 hex ตัวเล็ก)
- หาบุคลากร: บัญชี Provider ID ที่ผูกแล้ว → สมาชิก portal ที่ผูกแล้ว → บุคลากร ACTIVE คนเดียวที่เลขบัตรให้ hash_cid ตรงกัน (`NationalIdHashMatcher`)
- ไม่ผูกบัญชี ไม่บันทึก audit ไม่เก็บหรือ log hash_cid
- ตอบ `{ "organizations": ["งาน…", "กลุ่มงาน…", "โรงพยาบาล…"] }` จากหน่วยงานปัจจุบันขึ้นไป, 404 ถ้าไม่พบ, 401 token ไม่ถูกต้อง, 503 เกิน 2.5 วินาทีหรือโหลดกุญแจไม่ได้
- portal เลือกหน่วยงานแรกในรายการที่ชื่อตรงกับหน่วยงาน active ของตน เฉพาะใบสมัครที่ยังเป็นร่างและยังไม่ได้เลือกหน่วยงาน

## การทดสอบ

- `apps/web/src/app/api/portal/organization/route.test.ts`
- `packages/core/src/identity/oidc-client.test.ts` (hash_cid)
- `packages/core/src/hr/profile-service.integration.test.ts` (`currentOrganizationNamesOf`)
