# Smart Money round 5: monitor แพทย์แผนไทย (`/money/ttm`)

Status: approved by the user as part of moving the whole system ("ย้ายระบบทั้งหมด … ฟังก์ชันการทำงานเหมือนเดิมเป๊ะๆ", "ทำเลย",
"ต่อเลย" 2026-11-18). Parent: `2026-11-13-smart-money-design.md`. Legacy: `modules/ttm_monitor` (TtmRepository.php, TtmSummary.php,
procedure_icodes.php, herb_icodes.php, bootstrap.php, index.php, mapping.php, dashboard.js/css) and `tests/ttm_monitor/*`, legacy spec
`docs/superpowers/specs/2026-11-13-ttm-monitor-design.md`. Pattern: round 1b (`/money/dental`, read live from HOSxP, nothing stored).

## Why
กลุ่มงานแพทย์แผนไทยและการแพทย์ทางเลือก makes a daily report (สรุปผลการดำเนินงานประจำวัน) by hand: people and money for นวด, ประคบ,
อบ, พอกเข่า, หลังคลอด, หัตถการอื่น, ยาสมุนไพร and the OPD fee, by สิทธิ, plus IPD and after-hours, and by day / month / ปีงบ. The legacy
page builds it from HOSxP; it is being retired, so BackOffice must give the same numbers and screens.

## Behaviour (same as legacy unless listed under "Changed")
1. **Data (HOSxP, read only).** For the chosen range the three legacy SELECTs: services (`health_med_service` + type, doctor,
   treatment type, patient name), visits (`ovst` an/pttype + `pttype` name/hipdata_code of those vn), items (`opitemrece` of those vn
   grouped by vn, icode, income with income name, item name, is-drug, qty, amount). Thai text is repaired like dental.
2. **Rules** (`TtmSummary::rules`, `classify`, `kind`, `rightGroup`, `isIpd`, `isAfterHours`, `fiscalYear`) ported exactly: 47
   procedure icodes with their kind, 62 herb icodes, OPD fee icode 3015968, keywords, after-hours 16:00, and the same `TTM_*` settings
   (`TTM_AUTO_DETECT`, `TTM_MASSAGE_INCOME`, `TTM_HERB_INCOME`, `TTM_MASSAGE_ICODES`, `TTM_HERB_ICODES`, `TTM_OPD_FEE_ICODES`,
   `TTM_AFTER_HOURS_FROM`, `TTM_KIND_MAP`, `TTM_RIGHT_MAP`) read from the server environment, empty = default, as legacy did.
   Round 6 (herb) reuses the herb list and สิทธิ groups.
3. **Summary** (`TtmSummary::summarize`) ported exactly; parity checked against the PHP on a generated fixture.
4. **Dashboard** in legacy order: date filter (ตั้งแต่/ถึง, default today; end defaults to start; reversed swapped; cut to 1,830 days; a B.E. year reads as unset) with the 7 preset chips (วันนี้, เมื่อวาน,
   เดือนนี้, เดือนที่แล้ว, ปีงบประมาณนี้, ปีงบที่แล้ว, 3 ปีงบย้อนหลัง), links to ตรวจสอบการจับคู่รหัส and ดาวน์โหลด Excel; banner
   "สรุปผลการดำเนินงาน(ประจำวัน)" with the date (`วันพฤหัสบดี ที่ 5 พฤศจิกายน 2569` for one day, `from – to` otherwise); the report
   table (ผู้รับบริการทั้งหมด, IPD, นอกเวลา rows with people under the money; one row per สิทธิ group, สิทธิอื่น ๆ only when used; OPD
   fee row; รวมทั้งสิ้น) beside 7 KPI cards; people per service by สิทธิ; money per service by สิทธิ; สรุปตามช่วงเวลา รายวัน /
   รายเดือน / รายปีงบ (hidden for one day; default by span ≤ 62 days → day, ≤ 731 → month, else ปีงบ) as a stacked chart by service
   and a table; รวมค่าบริการแยกตามสิทธิ; ประเภทบริการ (top 12); ผู้ให้บริการ and ประเภทการรักษา tables; รายชื่อผู้รับบริการ with
   search and the note. Money shows no decimals when whole (`ttm_baht`). No data: "ไม่พบผู้รับบริการแพทย์แผนไทยในช่วงวันที่ที่เลือก".
5. **Excel** with the legacy sheets and columns: สรุปตามสิทธิ (title, period, rows), คนรายบริการตามสิทธิ, รายได้รายบริการตามสิทธิ,
   รายวัน, รายเดือน, รายปีงบ, รายชื่อผู้รับบริการ; file `ttm-<start>[_<end>].xlsx`.
6. **ตรวจสอบการจับคู่รหัส** (`/money/ttm/mapping`): same filter, the current settings box, 4 KPI cards (incl. ไม่นับ), the income
   table, the icode table with search, pttype → group and ประเภทบริการ tables.

## Changed on purpose
- Sign-in and rights: a new page tick `ttm` (or Smart Money manager) for both pages; checked on the server.
- HOSxP connection comes from ตั้งค่าการเชื่อมต่อ (as dental). The three SELECTs run in one `READ ONLY` transaction (a new
  `readOnly` option on the database client) after the legacy `isReadOnly` text check. Errors log only the driver code.
- Charts are BackOffice CSS charts: the period chart is a stacked `GroupedBarChart` by service (people in each bar's title and in
  the table, instead of a line); rights and types are `BarChart`s. Settings are shown, not edited (as legacy: change the env, restart).
- Dates are entered with `ThaiDateInput`. Patient names and HN stay on the page and in the Excel as legacy; nothing is stored or
  audited (a read-only view like dental's page).

## Non-goals
Writing to HOSxP, editing the code lists in the UI, the herb dispense module (round 6).
