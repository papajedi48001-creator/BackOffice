# Monitor Instrument OFC — design

Requested by wasan, 2026-11-24.

## Intent

ติดตามการเบิกอุปกรณ์ (Instrument, ADP 8610) ของผู้ป่วยสิทธิข้าราชการ (OFC) ให้เห็นว่าใครได้รับอุปกรณ์ เรียกเก็บเท่าไร และ (รอบถัดไป) ได้รับจริงตาม REP/Statement แล้วหรือยัง โครงสร้างหน้าเหมือน Monitor IMC

## Source (HOSxP, read only)

- ผู้ป่วยนอก: `ovst.pttype = pttype.pttype AND pttype.hipdata_code = 'OFC'`.
- นับเฉพาะผู้ป่วยที่มีรายการ `opitemrece.icode = nondrugitems.icode AND nondrugitems.nhso_adp_code = '8610'`.
- Filter by `ovst.vstdate` in the chosen range; group by vn and icode (qty and sum_price summed).
- Name from `patient` (pname fname lname). Tables: ovst, pttype, opitemrece, nondrugitems, patient — all already in `infra/hosxp/grant-backoffice-api.sql`; no new GRANT.
- Nothing is stored; read live like การจ่ายยาสมุนไพร (READ ONLY transaction, SELECT guard, connection from ตั้งค่าการเชื่อมต่อ).

## Page

- New Smart Money page `ofc` at `/money/ofc`, menu "Monitor Instrument OFC"; members given the page or Smart Money managers (new `MoneyPage` value `ofc`).
- ช่วงวันที่: the TTM/dental search card (`TtmFilter`) with its presets; default เดือนนี้ as on the TTM pages.
- การ์ดสรุป: ผู้ป่วย (คน), ครั้ง (visits), จำนวนอุปกรณ์ (ชิ้น), เรียกเก็บ (บาท), REP/Statement (รอนำเข้าไฟล์ until round 2).
- กราฟการเรียกเก็บ by item, อัตโนมัติ/รายวัน/รายเดือน/รายปีงบ (same buckets as IMC).
- รายละเอียดรายบุคคล: ลำดับ, ชื่อ-สกุล (HN), สิทธิ, ครั้ง, ชิ้น, เรียกเก็บ, ล่าสุด; click a row to open its lines (วันที่รับบริการ, VN, รหัส, รายการ, จำนวน, เรียกเก็บ).
- รายการอุปกรณ์: per icode, คน/ครั้ง/ชิ้น/บาท.
- Dates read `16 พ.ย. 2569`.

## Round 2 (after sample files)

นำเข้า REP / Statement ของ OFC, stored encrypted like IMC REP, matched to HOSxP lines (expected by HN + date, or VN/claim number — decided from the real columns) to show REP/Statement amounts, ยังไม่มีผล, and a เรียกเก็บเทียบ REP/Statement table.

## Open

- IPD (`ipt.pttype`) not included until the user asks.

## Approaches

1. Live HOSxP read per range (chosen): no copy of patient data, same as herb/TTM, always current.
2. Nightly copy into BackOffice: faster pages but a second copy of patient data to keep in step; not needed at this volume.
