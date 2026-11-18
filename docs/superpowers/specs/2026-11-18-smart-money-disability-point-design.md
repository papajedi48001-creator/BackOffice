# Smart Money round 4: Point ฟื้นฟูผู้พิการ (`/money/disability`)

Status: approved by the user as part of moving the whole system ("ย้ายระบบทั้งหมด … ฟังก์ชันการทำงานเหมือนเดิมเป๊ะๆ", "ทำเลย",
"ต่อเลย" 2026-11-18). Patient data is stored as the user chose for FDH ("Encrypt, show all": encrypted at rest, shown as before).
Parent: `2026-11-13-smart-money-design.md` (round 4). Legacy: `modules/disability_point` (DpParser.php, DpStore.php, dp-core.js,
dashboard.js, index.php, upload.php/js) and its tests `tests/disability_point/*`. Pattern: round 3 (`/money/fdh`).

## Why
Staff export the rehabilitation services (บริการฟื้นฟูสมรรถภาพ) from the NHSO program as CSV (TIS-620) and follow, by ปีงบ,
day or chosen range, how many visits and how much was claimed (AE "รวมราคาที่ขอเบิก") against what may be claimed (AF
"รวมราคาที่พึงเบิกได้"), by service, with the rows that carry a status code (ติดสถานะ) set apart. The PHP page is being
retired; BackOffice must give the same numbers and screens.

## Behaviour (same as legacy unless listed under "Changed")
1. **Upload (ผู้ดูแล Smart Money only).** Pick or drop many .csv (TIS-620 or UTF-8), .xls/.xlsx or .zip files (Thai file names
   inside a zip decoded from TIS-620). The browser finds the header row in the first 10 rows (a row with "เลขที่อ้างอิง" and
   "ชื่อบริการฟื้นฟู"), turns Excel date cells into `d/m/yyyy` พ.ศ., and posts the header plus at most 1,500 data rows at a
   time. The server parses exactly as `DpParser::parse` (columns by name, same required columns and messages, B.E./C.E. and ISO
   dates, comma numbers, collapsed service names, status "D24," → "D24", rows without เลขที่อ้างอิง or a valid date counted as
   skipped) and merges by เลขที่อ้างอิง: a known ref replaces the old row (and moves ปีงบ if its date moved). Result line per file:
   "✓ ไฟล์: N ครั้ง (ปีงบ 2569: n) · ใหม่ a · แทนที่ของเดิม u · ข้าม s แถว (ไม่มีเลขที่อ้างอิง/วันที่)" or "✗ ไฟล์: <reason>".
2. **ข้อมูลที่นำเข้าแล้ว (files page).** One row per ปีงบ, newest first: วันที่รับบริการ from–to, ครั้ง, ขอเบิก, พึงเบิก (all rows),
   ติดสถานะ, latest file name, last update; ลบ a whole ปีงบ, confirmed in `ActionDialog`. Note that พึงเบิก here is all rows while
   the dashboard leaves out flagged rows.
3. **Dashboard (everyone allowed on the page)**, computed in the browser by a port of `dp-core.js` (`fiscalYear`, `fyRange`,
   `isFlagged`, `filterRecords`, `summarize`, `byService`, `byStatus`, `trend` with 62-day daily/monthly switch). Screens in legacy
   order: status line ("ข้อมูล N ครั้ง · Y ปีงบ (from – to) · ปรับปรุงล่าสุด …") and โหลดข้อมูลล่าสุด; time view รายปีงบ (select,
   latest first) / รายวัน (‹ day ›) / เลือกช่วงเวลา (from, to) with `ThaiDateInput`; สิทธิหลัก, กลุ่มเป้าหมาย, ประเภทการรับบริการ
   selects with counts; "กำลังแสดง:" tags and ล้างตัวกรอง; 6 KPI cards (จำนวนครั้ง, ผู้รับบริการ, ราคาที่ขอเบิก (AE), ราคาที่พึงเบิก
   (AF), ส่วนต่าง, ติดสถานะ); รายชื่อบริการฟื้นฟู table with a รวม row and a chart of พึงเบิก per service (click a service → list of
   that service); แนวโน้ม รายวัน/รายเดือน (in รายวัน, the whole month of the day; click a bar → that day or month); สรุปรายปีงบ
   (filters apply, period does not; click → that ปีงบ); tabs รายการ (search, service/status tags with ✕, 50 per page, newest
   first) and ติดสถานะ (codes; click → list of that code); ดาวน์โหลด Excel with sheets ช่วงเวลา, รายบริการ, แนวโน้ม, รายการ and the
   legacy column names, file `point-disability-YYYYMMDD.xlsx`.
4. No data: "ยังไม่มีข้อมูล" with a link to the files page for managers.

## Changed on purpose
- Sign-in and rights as rounds 2–3: upload and delete need `money.manage`, checked on the server before the body is read;
  viewing needs the new `disability` page tick (or manage).
- Storage: MariaDB `money_dp_record`, one row per เลขที่อ้างอิง with ปีงบ, date and the numbers the files page sums in clear, and the
  whole parsed record (เลขบัตรประชาชน, name, HN …) as JSON **encrypted with the national-ID key**. `money_dp_upload` logs each
  uploaded file per ปีงบ (the browser sends one upload id per file, so its parts add up to one log row; legacy merged parts by
  name within a minute). The original file is not kept. Without the key, upload is refused with a Thai message.
- เลขบัตรประชาชน and names leave the server only in the JSON for people allowed on the page; never in a URL, log or audit. Audit:
  `money.dp.upload` {rows, added, updated}, `money.dp.remove` {fy, records}.
- Charts: BackOffice CSS bars (`BarChart`), not Chart.js; the trend shows จำนวนครั้ง bars with พึงเบิก under each label.
- Clickable rows open from a button in the row (service name, ปีงบ, status code).

## Constraints
- Body ≤ 2 MB; ≤ 1,501 rows of ≤ 80 cells (strings ≤ 1,000 chars, finite numbers, booleans or null); file name ≤ 255.
- Reuse the round 2–3 zip reader, upload helpers and popups; client components import only types from `@backoffice/core`.

## Non-goals
Fetching from the NHSO program directly, editing records, the herb or TTM modules (rounds 5–6).
