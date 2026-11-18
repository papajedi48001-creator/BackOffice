# Smart Money round 3: ติดตามกองทุนย่อย FDH (`/money/fdh`)

Status: approved by the user as part of moving the whole system ("ย้ายระบบทั้งหมด … ฟังก์ชันการทำงานเหมือนเดิมเป๊ะๆ", "ทำเลย",
2026-11-18). How patient ID (PID) is stored was put to the user as a decision; this spec follows the recommended option
(encrypted at rest, shown as before) until they answer.
Parent: `2026-11-13-smart-money-design.md` (round 3). Legacy: `modules/fdh_monitor` (FdhRepParser.php, FdhStmParser.php,
FdhStore.php, fdh-core.js, dashboard.js, upload.php/js) and its tests `tests/fdh/*`. Pattern: round 2 (`/money/nhso`).

## Why
Staff upload the FDH e-claim REP files (what was claimed, per visit) and the STM statements (what NHSO paid, per period) and
follow each visit (VN = SEQ) through ได้รับเงินแล้ว / รอ STM / ติด C / ยอดไม่ตรง / ไม่พบ REP, by กองทุนย่อย, person and Error
Code. The PHP page is being retired; BackOffice must give the same numbers and screens.

## Behaviour (same as legacy unless listed under "Changed")
1. **Upload (ผู้ดูแล Smart Money only).** Pick or drop many .xls/.xlsx files or a .zip of them. The browser reads them with
   SheetJS, keeps only the sheets used (REP: `Detail`, `Data DENY`, `Data Drug`; STM: `รายงานสรุป…`, `รายละเอียด…`, names
   trimmed), turns Excel date cells into `dd/mm/yyyy` พ.ศ., trims empty cells at the end of rows and posts `{fileName, sheets}`
   per file. The server decides REP vs STM and parses exactly as `FdhRepParser::parse` / `FdhStmParser::parse` (same columns,
   same skipped rows, same messages, `doc_no` from "เลขที่เอกสาร" else the file name, `[A-Za-z0-9_]` only). One document per
   (type, doc_no); uploading it again replaces it. Result line per file: "✓ ไฟล์: REP 1234 (56 เคส) — แทนที่ข้อมูลเดิม" /
   "STM … งวด … (… แถว)" or "✗ ไฟล์: <reason>". Files over 10 MB and Excel temp files are refused; a .zip may be up to 200 MB.
2. **ไฟล์ที่นำเข้าแล้ว (files page).** Two tables, STM (newest งวด first) and REP (newest เลขที่เอกสาร first), with count and
   sum (REP: ชดเชยสุทธิ, STM: ยอดชดเชยทั้งสิ้น), file name and upload time; ลบ one document and ลบ REP/STM ทั้งหมด, each confirmed
   in `ActionDialog`.
3. **Dashboard (everyone allowed on the page)**, computed in the browser by a port of `fdh-core.js` with the same formulas:
   `buildCases` (REP × STM by SEQ, TRAN_ID fallback, newest REP wins, fixedC), `learnFundColumns`, `splitVisit`,
   `filterCases`, `summarize`, `bySubFund`, `byMoneyColumn`, `byErrorCode`, `byPerson`, `byPersonFund`, `byFundVisit`. Screens
   in legacy order: status line and โหลดข้อมูลล่าสุด; filters (วันรับบริการ from/to with `ThaiDateInput`, งวด STM, สิทธิหลัก,
   กองทุนย่อย, สถานะ, ล้างตัวกรอง); KPI cards and status strip; รายกองทุนย่อย (chart + table, click → cases); ยอดตามคอลัมน์เงิน
   STM by งวด; detail tabs รายเคส / รายบุคคล / รายกองทุนย่อย / Error Code with search, chips and paging; case and person
   popups (close only from their button); ดาวน์โหลด Excel with the legacy sheets and column names.
4. No data: "ยังไม่มีข้อมูล" with a link to the files page for managers.

## Changed on purpose
- Sign-in and rights as round 2: uploading and deleting need `money.manage`, checked on the server before the body is read;
  viewing needs the `fdh` page tick (or manage). Same-origin check is the BackOffice one.
- Storage: MariaDB table `money_fdh_document` (type, doc_no, header fields, count, sum, file name, uploader, time) with the
  parsed document (cases, rows, denies, drugs) as JSON **encrypted with the national-ID key** (it holds PID and patient names).
  The original Excel file is not kept (legacy kept it but never showed it).
- PID and names leave the server only in the JSON for people allowed on the page; never in a URL, log, audit or notification.
- Charts: BackOffice CSS bars (GroupedBarChart), not Chart.js.
- Audit: `money.fdh.upload` {kind, rows}, `money.fdh.remove` {kind}, `money.fdh.remove_all` {kind, documents}. No doc_no,
  hospital, patient or money in audit.

## Constraints
- Server never runs SheetJS; it validates the posted sheets (≤ 6 sheets, ≤ 30,000 rows and ≤ 200 cells per row each (a REP `Detail` row has about 120), cells ≤
  1,000 characters, numbers, strings, booleans or null; body ≤ 24 MB).
- Reuse round 2's browser reader (`@e965/xlsx`), upload helpers and GroupedBarChart; client components import only types from
  `@backoffice/core`.
- Without the national-ID keys configured the service refuses uploads with a Thai message (nothing stored in plain text).
- The herb module (round 6) reads the stored REP documents (`drugs`, `cases`); keep the legacy document shape.

## Non-goals
Fetching from FDH directly, comparing with HOSxP, editing documents.
