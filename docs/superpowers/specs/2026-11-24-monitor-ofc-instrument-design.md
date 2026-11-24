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

## REP / Statement (samples received 2026-11-24)

- REP `eclaim_<hcode>_OPCS_….xls`: sheet Detail (REP, TRAN_ID, วันเข้ารักษา, SEQ NO) and Data Instrument (TRAN_ID, ลำดับที่, รหัส/ชื่ออุปกรณ์, จำนวนชิ้นและเงินที่เรียกเก็บ, จ่ายชดเชย, ปฏิเสธ, Error Code). Lines are joined by TRAN_ID.
- Statement `STM_<hcode>_OP<yyyymm>_<nn>.xls`: sheet พึงรับ, one block per REP NO, column ค่าอวัยวะฯ and พึงรับทั้งหมด per SEQ NO; document number from "เลขที่เอกสาร".
- SEQ NO is the HOSxP vn, so matching is by vn. Only ADP 8610 REP lines count.
- Stored (migration 0046) without name, HN or PID: `money_ofc_rep` (REP, TRAN_ID, ลำดับที่, vn, date, ADP, item, qty, claim, paid, deny, error) and `money_ofc_stm` (document, REP, vn, date, claim, ค่าอวัยวะฯ, total). The browser blanks 13-digit IDs before sending. Re-importing replaces.
- Status per visit: ได้รับแล้ว (Statement ค่าอวัยวะฯ > 0) · รอ Statement (REP paid > 0) · ปฏิเสธ (REP paid 0) · ยังไม่มี REP.

## Open

- IPD (`ipt.pttype`) not included until the user asks.

## Approaches

1. Live HOSxP read per range (chosen): no copy of patient data, same as herb/TTM, always current.
2. Nightly copy into BackOffice: faster pages but a second copy of patient data to keep in step; not needed at this volume.

## Follow-up: one page with การ์ดเมนู (2026-11-24, user chose แบบ 2)

- Monitor Instrument OFC moves into กองทุนฟื้นฟูสมรรถภาพ (`/money/disability?tab=imc|ofc|dp`); the separate menu item goes and `/money/ofc` redirects to the OFC tab, keeping its range.
- Three cards above the content: Monitor IMC (ทะเบียน คน · เรียกเก็บ, ใกล้ครบกำหนด ≤ 30 วัน), Instrument OFC (คน · ครั้ง · บาท of the range, ยังไม่มี REP / ปฏิเสธ / รอ Statement), บริการฟื้นฟู (newest ปีงบ: ครั้ง · ขอเบิก, ติดสถานะ or ข้อมูลล่าสุด). The open card is outlined.
- A tab shows only to whom may open it: IMC and บริการฟื้นฟู need the `disability` page, OFC the `ofc` page; the menu item shows for either.
