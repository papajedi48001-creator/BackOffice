# Smart Money round 2: เงินโอน สปสช. (`/money/nhso`)

Status: approved by the user ("ย้ายระบบทั้งหมด … ใช้ภาษาตามระบบ BackOffice เลย แต่ฟังก์ชันการทำงานเหมือนเดิมเป๊ะๆ", "ทำเลย", 2026-11-18).
Parent: `2026-11-13-smart-money-design.md` (round 2). Legacy: `ongrx25/Smart_Money_Waritchaphum` `modules/nhso_transfer` and its
spec `docs/superpowers/specs/2026-11-11-nhso-transfer-design.md` (screens §5, errors §6, tests §7). Terms: CONTEXT.md (เงินโอน สปสช.).

## Why
Staff compare the NHSO transfer reports (รายงานเอกสารการโอนเงินแยกตามหน่วยงาน, one .xlsx per หน่วยบริการ per ปีงบ) of
Waritchaphum with the neighbouring hospitals, fund by fund. The PHP page is being retired, so BackOffice must do the same,
with the same numbers and the same screens.

## Behaviour (same as legacy unless listed under "Changed")
1. **Upload (ผู้ดูแล Smart Money only).** Pick or drop many .xlsx/.xls/.xlsm/.csv files or a .zip of them. The browser reads the
   first sheet (SheetJS), turns Excel date cells into `dd/mm/yyyy` (พ.ศ.), and posts the table (array of rows) per file. The
   server validates it like `NhsoReport::parse`: header row = first row with ≥ 3 filled cells; required columns วันที่โอน,
   กองทุน, คงเหลือ, เงินโอนเข้าบัญชี; หน่วยบริการ code (5 digits) and name from the report header, never the file name; ปีงบ from
   "วันที่โอนตั้งแต่ …" or else the first transfer date; rows "รวม/ยอดรวม/total" and empty rows are not counted. One dataset per
   (หน่วยบริการ, ปีงบ); uploading it again replaces it. Per-file result line: "นำเข้าแล้ว 11093 โรงพยาบาลวาริชภูมิ ปีงบ 2569 (678
   แถว) — แทนที่ข้อมูลเดิม" or the Thai error. Files over 10 MB and Excel temp files (`~$…`) are refused.
2. **ข้อมูลในระบบ (files page).** Table ปีงบ, รหัส, หน่วยบริการ, ช่วงวันที่โอน, แถว, เงินโอนเข้าบัญชี, ไฟล์, อัปโหลดเมื่อ; ลบ one
   dataset and ลบข้อมูลทั้งหมด, each confirmed in `ActionDialog`.
3. **Dashboard (everyone allowed on the page)**, computed in the browser from all datasets by a port of `nhso-core.js` with the
   same formulas: `buildDatasets` (merge one hospital's ปีงบ, allocate เงินโอนเข้าบัญชี by คงเหลือ, warn on unbalanced groups or a
   hospital loaded twice), `defaultSettings`, `runCompare`, `monthOf`. Sections in legacy order:
   - status line "ข้อมูลล่าสุด … · N ไฟล์ (ปีงบ …)" and "โหลดข้อมูลล่าสุด";
   - ภาพรวม: ปีงบ chips (default: latest two; a new year is ticked when it appears), ยอดที่แสดง, hero card โอนสะสม of
     โรงพยาบาลวาริชภูมิ (all hospitals when not found) with per-year pills and change %, and the first 13 fund cards (amount of
     Waritchaphum, share %, change badge, mini chart comparing hospitals by year);
   - รายละเอียดและรายงาน: stats, ยอดเงินตามกองทุนเทียบทุกโรงพยาบาล (table + chart by year), รายรับแยกรายกองทุน (pick funds and
     years, grouped or stacked, table), เทียบรายกองทุนตามปีงบ (hospital, metric, years, table with ผลต่าง and %), report tabs
     (สรุป, เทียบยอด …, แถวที่ขาด, ตารางมี-ไม่มี, ค่าไม่ตรงกัน, ยอดตามกองทุน-รพ, เทียบปีงบ, key ซ้ำ) with search (first 2,000 rows
     shown) and ดาวน์โหลดรายงาน Excel;
   - ข้อมูลไฟล์และการตั้งค่าการเทียบ (collapsed): header row (0 = auto), key and compare columns, tolerance, ignore case,
     aggregate duplicate keys, pivot column, เริ่มเทียบข้อมูล, คืนค่าเริ่มต้น; remembered in this browser only (localStorage).
   - Fewer than 2 hospitals: the legacy messages; none: "ยังไม่มีข้อมูล …".

## Changed on purpose
- Admin code 11093 / PHP session → BackOffice sign-in; uploading and deleting need `money.manage` (ผู้ดูแลระบบ or
  ผู้จัดการโมดูล Smart Money), checked on the server. Viewing needs the `nhso` page tick (or manage).
- Storage: MariaDB table `money_nhso_dataset` (the table as JSON plus header fields), not JSON files. The original file is not
  kept (legacy kept it but never showed it).
- Charts: BackOffice CSS bars (no Chart.js), values on hover/focus and in the tables next to them.
- Audit: `money.nhso.upload` {fy, rows}, `money.nhso.remove` {fy}, `money.nhso.remove_all` {count}. No hospital rows in audit.

## Constraints
- Server never runs SheetJS; it validates the posted table (≤ 20,000 rows, ≤ 80 columns, cells ≤ 1,000 characters, numbers,
  strings, booleans or null).
- SheetJS: `@e965/xlsx@0.20.3` pinned (the official 0.20.3 build republished on npm; npm `xlsx@0.18.5` fails `pnpm audit`
  high and cdn.sheetjs.com is not reachable from the build machines). Loaded only in the browser, only on these pages.
- Client components import only types from `@backoffice/core` (guard test).

## Non-goals
Comparing with HOSxP claims, fetching from Google Drive or the NHSO site.
