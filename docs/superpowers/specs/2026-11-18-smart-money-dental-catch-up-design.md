# Smart Money: ลูกหนี้ทันตกรรม catch-up with the legacy page (round 1b)

Status: approved by the user's "ย้ายระบบทั้งหมด … ฟังก์ชันการทำงานเหมือนเดิมเป๊ะๆ" (2026-11-18). Extends `2026-11-13-smart-money-design.md` §7.3.

## Why
The legacy PHP page changed 15 times after round 1 shipped. The user is retiring it, so BackOffice must do what it does now.

## What changes (legacy commits up to `86d1945`, `modules/dental_claims`)
1. **Visit selection.** One row per visit with dental work (`dtmain` grouped by vn, hn, vstdate in the range) instead of K00–K11 diagnoses. The row shows the visit's main diagnosis (`ovstdiag.diagtype = '1'`, may be empty), the ทันตแพทย์ (`dtmain.doctor` → `doctor.name`) and ผู้ช่วย (`doctor_helper`).
2. **ลูกหนี้** = `max(ค่ารักษารวม − ชำระแล้ว, 0)` (was `rcpt_money`). The filter "rcpt_money > 0 or paid < total" stays.
3. **งานฟันปลอม.** A visit is denture work when `opitemrece` holds one of the 10 legacy icodes (`DENTURE_ICODES`). Each group carries `dentureClaim`, `dentureVisits`, `denturePatients`.
4. **คาดการณ์รายรับทันตกรรม** = ลูกหนี้ of every visit whose ผังบัญชี is not UC-OP ใน CUP (`/UC.*ใน\s*CUP/i`) and not PP (`/(?<![A-Za-z])P\s*&?\s*P(?![A-Za-z])/`). Fifth KPI card.
5. **Red bars.** By ผังบัญชี: groups that are UC ใน CUP or PP. By สิทธิ: groups with any visit whose ผังบัญชี is UC ใน CUP.
6. **Group chart** shows มูลค่าลูกหนี้ (sorted by ลูกหนี้, largest first) stacked: ลูกหนี้ without dentures + ฟันปลอม (orange), labels show people; title "มูลค่าลูกหนี้แยกตาม…". Summary table keeps its order (by ค่ารักษารวม).
7. **Detail table** adds ทันตแพทย์, renames ICD-10 to Diag หลัก, and gets two filters (ทุกสิทธิ / ทุกผังบัญชี) next to search; when any filter is active a line shows rows, visits and ลูกหนี้ of what is shown (money once per visit).
8. **CSV** columns: VN, วันที่รับบริการ, HN, ชื่อ-สกุล, Diag หลัก, ชื่อโรค, ทันตแพทย์, ผู้ช่วย, รหัสสิทธิ, ชื่อสิทธิ, ผังบัญชี, ค่ารักษารวม, ชำระแล้ว, ลูกหนี้ (ค่ารักษารวม-ชำระแล้ว).
9. Texts: "งานทันตกรรม (dtmain)", "Diag หลักที่พบบ่อย (Top 10)", the note "1 แถว = 1 visit ที่มีงานทันตกรรม (dtmain) …".

## Kept from BackOffice
- ผังบัญชี follows the สิทธิ's current mapping row (commit f7f12fb4), not the legacy year match. The forecast and red rules read that name.
- Parity is checked by regenerating `dental-expected.json` from the legacy PHP `summarize` (now with `forecast`, `red`, denture fields).

## Non-goals
Legacy admin-code login (BackOffice permissions replace it).
