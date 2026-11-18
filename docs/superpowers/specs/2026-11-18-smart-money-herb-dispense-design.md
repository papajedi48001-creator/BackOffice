# Smart Money round 6: การจ่ายยาสมุนไพร (`/money/herb`)

Status: approved by the user as part of moving the whole system ("ย้ายระบบทั้งหมด … ฟังก์ชันการทำงานเหมือนเดิมเป๊ะๆ", "ทำเลย",
"ต่อเลย" 2026-11-18). Parent: `2026-11-13-smart-money-design.md`. Legacy: `modules/herb_dispense` (HerbRepository.php, HerbSummary.php,
ontop_icodes.php, bootstrap.php, index.php, dashboard.js/css) and `tests/herb_dispense/*`, legacy spec
`docs/superpowers/specs/2026-11-16-herb-dispense-design.md`. Pattern: round 5 (`/money/ttm`, read live from HOSxP, nothing stored),
plus the REP files already stored by round 3 (`/money/fdh`).

## Why
งานประกัน/การเงิน analyse every herbal drug the hospital dispenses: count, ต้นทุน, มูลค่าจริง, the expected ontop ชดเชย (UC only) and
what REP actually paid (HERB_FS), by drug and by สิทธิ. The legacy page is being retired, so BackOffice must give the same numbers.

## Behaviour (same as legacy unless listed under "Changed")
1. **Data (HOSxP, read only).** The legacy SELECT: `opitemrece` of the herb icodes for `rxdate` in the range, every department (OPD
   and IPD), grouped by rxdate, vn, an, icode, with `drugitems` name+strength, units, unitcost, stdprice and สิทธิ from `ipt` (when
   AN) or `ovst`. Icodes are bound as parameters, de-duplicated; an empty list is refused. Thai text is repaired like TTM.
2. **Rules** (`HerbSummary::rules`): herb icodes = the TTM herb list (so `TTM_HERB_ICODES` applies), สิทธิ groups and `TTM_RIGHT_MAP`
   from TTM, the 38 ontop rates of ontop_icodes.php (23 in baht, 15 in point, each with name, unit, std qty), and `HERB_POINT_BAHT`
   (a positive number converts points to baht; anything else = unset).
3. **Summary** (`HerbSummary::summarize`, `value`, `receivedFromRep`, `isHerbFund`) ported exactly; parity checked against the PHP on
   a generated fixture, plus the legacy tests.
   - ต้นทุน = qty × unitcost; มูลค่าจริง = qty × stdprice, or sum_price when stdprice is 0/empty.
   - ครั้ง = distinct VN, or AN for inpatients; ontop only for the UC group, once per visit and icode.
   - รับจริง: REP cases whose กองทุนย่อย has HERB_FS, Data Drug rows whose ชนิดยา starts with H, keyed `seq(VN)|icode`; a later
     report (report_date, doc_no) replaces the same TRAN_ID; matched once per vn|icode, never for AN rows. No REP = รอ REP (null).
   - รวม = มูลค่าจริง + รับจริง. Lists sort by value desc, qty desc, icode.
4. **Dashboard** in legacy order: the TTM date filter and presets with ⬆ อัปโหลด REP and ⬇ ดาวน์โหลด Excel; banner
   "การจ่ายยาสมุนไพร" with the period; 5 KPI cards (จำนวนครั้ง, ต้นทุน, มูลค่าจริง, รับจริง (REP), คาดการณ์ ontop) with the legacy
   sub-lines; chart by drug (มูลค่า/ต้นทุน or จำนวนครั้ง, ★ for ontop drugs); chart by drug stacked by สิทธิ; the สิทธิ table
   (จำนวนครั้ง, ต้นทุน, มูลค่าจริง, คาดการณ์ ontop with "+ n point" while unconverted, รับจริง, รวม; สิทธิอื่น ๆ only when used; each
   used group opens its drugs) with รวมทั้งสิ้น; รายยาสมุนไพร with search and the note. No data: "ไม่พบการจ่ายยาสมุนไพรในช่วงวันที่ที่เลือก".
5. **Excel** with the legacy sheets and columns: สรุปตามสิทธิ (title, period, rows), สิทธิ×รายยา, รายยา, รายวัน; file
   `herb-dispense_<start>_<end>.xlsx`.

## Changed on purpose
- Sign-in and rights: a new page tick `herb` (or Smart Money manager), checked on the server. The REP files are read on the server
  only as tran_id, seq, sub_fund, icode, type and paid; no PID or name leaves the FDH store for this page.
- ⬆ อัปโหลด REP goes to `/money/fdh/files` and shows only to those who may upload there (Smart Money managers).
- Every REP stored in BackOffice already keeps its Data Drug sheet (round 3), so the legacy "ต้องอัปโหลดใหม่" warning never applies
  and is dropped.
- HOSxP connection from ตั้งค่าการเชื่อมต่อ; one `READ ONLY` transaction with the round-5 fallback; errors log only the driver code.
- Charts are BackOffice CSS charts (`BarChart` / stacked `GroupedBarChart`), numbers in titles and tables. Group rows open from a
  button in the row. Dates are entered with `ThaiDateInput`.

## Non-goals
Writing to HOSxP, editing ontop rates in the UI, matching the 5 drugs without an icode, IPD REP.
