# กองทุนฟื้นฟูสมรรถภาพ · Monitor IMC — design

## Intent

The Smart Money page `/money/disability` ("Point ฟื้นฟูผู้พิการ") becomes **กองทุนฟื้นฟูสมรรถภาพ** and gains a **Monitor IMC**
section at the top. Its job: show which IMC (Intermediate Care) patients are still inside their entitlement window, how long each
has left, how many times each was claimed, and how the claims compare with what the สปสช. REP paid. Everything already on the page
stays as it is, below the new section.

Approved by wasan from the mockup "แบบ 1 + ผู้ป่วยในทะเบียน" (https://claude.ai/artifact/4byd1dgbGQfaQEhVcjFhs9).

## Goals

- Rename the menu, page title and page heading "Point ฟื้นฟูผู้พิการ" → "กองทุนฟื้นฟูสมรรถภาพ" (files page: "จัดการไฟล์บริการฟื้นฟู (กองทุนฟื้นฟูสมรรถภาพ)").
- นำเข้าไฟล์ (ผู้ดูแล Smart Money only): the IMC register CSV (ทะเบียนคนไข้ IMC) and the REP individual xlsx from สปสช.
- Monitor IMC, in this order:
  1. นำเข้าไฟล์ button (managers only) and last-update line.
  2. Four KPI cards: ทะเบียน IMC (คน, with โรค split), เรียกเก็บ IMC (บาท, ครั้ง), REP (บาท, with "ยังไม่มี REP" บาท), ใกล้ครบกำหนด ≤ 30 วัน (คน).
  3. ผู้ป่วยในทะเบียน: one card per person with a ring of days left, โรค, จำหน่าย/ครบ dates, a tag "เหลืออีก x เดือน y วัน",
     ครั้ง and บาท; toggle filter ทั้งหมด / ≤ 30 วัน / 31–60 วัน / ครบกำหนดแล้ว; nearest due first.
  4. รายละเอียดรายบุคคล table: ลำดับ, ชื่อ-สกุล (+โรค), วันเริ่มป่วย, วันจำหน่าย, เหลืออีก, เรียกเก็บ (ครั้ง).
  5. การเรียกเก็บ IMC grouped bar chart, one series per รหัสบริการ, toggle รายวัน / รายเดือน / รายปี (ปีงบ).
  6. เรียกเก็บเทียบ REP table: ลำดับ, ชื่อ-สกุล, เรียกเก็บ (บาท), REP (บาท), REP NO.

## Non-goals

- The third file (การให้บริการ IMC CSV) is not imported: 124 of its 127 rows are already lines of the register, it has no HN, and
  its national ID column is unusable. Picking it shows a message saying the register already holds this data.
- No Excel export, no editing of rows, no deletion UI in this round.
- No HOSxP access (no GRANT needed).

## Data and rules

- Register CSV (TIS-620, one row per service line). Header detected by "วันที่ครบกำหนดการให้บริการ" and "วันที่ให้บริการ".
  Line key = HN + วันที่ให้บริการ + ครั้งที่ + รหัสบริการ (unique in the real file). Re-uploading replaces a known line, adds new ones.
- Person = HN. Person fields come from that person's latest service line: ชื่อ นามสกุล, โรค, วันที่เริ่มป่วย,
  วันที่จำหน่ายจากผู้ป่วยใน, วันที่ครบกำหนดการให้บริการ, สถานะ (first สถานะ column). ครั้ง = number of lines, เรียกเก็บ = sum of
  รวมราคาที่ขอเบิก.
- เหลืออีก = วันที่ครบกำหนดการให้บริการ − today (Asia/Bangkok), shown as "x เดือน y วัน" (calendar months), "y วัน" under a
  month, "ครบกำหนดแล้ว n วัน" after it. A person whose สถานะ is "จำหน่ายจาก IMC แล้ว" shows that text and counts as ครบกำหนดแล้ว.
  Tone: > 60 days ok, 31–60 warn, 0–30 bad, past/discharged muted.
- REP xlsx: header row with "REP No." and "Trans ID" in the first 15 rows, the next row holds the sub-headers
  (จำนวน, รวมเงินที่ขอเบิก, ชดเชย, จ่ายเพิ่ม, เรียกคืน). Line key = REP No. + Trans ID + ลำดับที่ (item). Paid = ชดเชย + จ่ายเพิ่ม − เรียกคืน.
- Join REP ↔ register by HN (and HN + วันที่รับบริการ for "ยังไม่มี REP": register lines with no REP line on the same HN and date).
- Dates in both files are d/m/yyyy พ.ศ.; stored ISO ค.ศ.

## Privacy and access

- Name, HN, national ID and the full parsed line are stored only inside `record_ciphertext` (the existing `NationalIdProtector`).
  Clear columns: line key hash, service date, code, money. Audit metadata carries counts only.
- Read: Smart Money managers and members with the `disability` page. Upload: `money.manage` holders. Checked in the core service.

## Approaches considered

1. **New tables + server-built view (chosen).** Two encrypted tables, one service that returns persons, chart lines and totals.
   Keeps the register model separate from the Point records, whose file format and key differ.
2. Reuse `money_dp_record`: the register has no เลขที่อ้างอิง or ชื่อบริการฟื้นฟู, so it would need a fake key and would mix into
   the Point dashboard totals. Rejected.
3. Browser-only (no storage): every viewer would need the files. Rejected.

## Left to the builder

Component split, CSS names (reuse Smart Money style 2 classes), chart day range (the 31 days ending at the latest service date).

## Follow-up: hide people who are done (wasan, 2026-11-19, แบบ 1 from three mockups)

- A switch "ซ่อนคนที่จำหน่าย/ครบกำหนดแล้ว (n)" sits beside the ผู้ป่วยในทะเบียน filter and starts on.
- On, it hides people whose เหลืออีก group is ครบกำหนดแล้ว (past due or "จำหน่ายจาก IMC แล้ว") from the cards and from รายละเอียดรายบุคคล, and says "ซ่อนอยู่ n คน".
- เรียกเก็บเทียบ REP and the KPI cards keep everyone: money already claimed still counts.
- Choosing the ครบกำหนดแล้ว filter turns the switch off, since that asks to see them. (Builder's call.)
- "เรียกเก็บ … ครั้ง" counts register lines (one รหัสบริการ on one date); unchanged.
