# ปฏิทินและวันหยุด — design (2026-11-04)

Superpowers skills were followed by hand in this session (brainstorm → spec → plan → TDD).

## Behaviour

1. **วันที่ทุกจุด** แสดงชื่อวันเต็มก่อน และปีพุทธศักราช: `จันทร์ 9 พ.ย. 2569`; วันเวลา `จันทร์ 9 พ.ย. 2569 09:00` (เวลาไทย). The shared formatters in `apps/web/src/lib/bangkok-time.ts` change, and every page that built its own `Intl.DateTimeFormat` date now calls them.
2. **หัวปฏิทิน** ใช้ชื่อวันเต็ม (จันทร์ อังคาร … อาทิตย์), never `จ. อ.`; day numbers are larger (`--calendar-day-size`).
3. **ฟอนต์** one CSS variable `--font-family: Tahoma, 'Noto Sans Thai', sans-serif` on `:root`; Noto Sans Thai is loaded from Google Fonts where Kanit was.
4. **หัวโมดูลตรึงด้านบน**: the module top area (ปุ่มยื่นคำขอ, ป้ายสิทธิ์, ชิปโปรไฟล์, แถบย่อย) is `position: sticky; top: 0` with a solid `--surface` background and a light bottom line/shadow.
5. **วันหยุด** reuse the existing `leave_holiday` table (already used for leave counting and managed at `/leave/holidays` with FormDialog add/edit/delete). Migration `0029_holiday_sync.sql` adds `source` (`MANUAL`|`HOSXP`, default `MANUAL`) and `synced_at`, plus a single-row `hosxp_connection` table.
6. **HOSxP sync** reads `SELECT` only from table `holiday` on HOSxP (MySQL/MariaDB). Column mapping is configurable (date column default `holiday_date`, name column default `day_name`) and tolerant: if a configured column is missing, known aliases are tried (`holiday_date|hdate|date`, `day_name|holiday_name|name`). Rows with an unparseable date or empty name are skipped. Sync upserts `HOSXP` rows; a `MANUAL` row for the same date is never overwritten. HOSxP rows that no longer appear are left in place (deleting holidays silently is riskier than keeping them; admins can delete manually).
7. **Connection settings** under ผู้ดูแลระบบ → ตั้งค่าการเชื่อมต่อ: host, port, database, user, password, column names. The password is encrypted with AES-256-GCM under `CONNECTION_SECRET_KEY` (64 hex) and never sent back to the browser (the form shows only "ตั้งไว้แล้ว"). When the saved settings are empty, `HOSXP_DATABASE_URL` is the fallback. Actions: ทดสอบการเชื่อมต่อ and ดึงวันหยุดตอนนี้; each writes an audit event without secrets.
8. **Worker** runs the sync once a day (`HOLIDAY_SYNC_INTERVAL_MS`, default 24h; first run shortly after start). Failures are logged by error code only.
9. **ห้ามจองในวันหยุด**: room bookings (any chosen date) and fleet requests (any Bangkok date between depart and return) are rejected on the server with `BOOKING_ON_HOLIDAY` and the holidays found; the UI shows `วันที่ <date> เป็นวันหยุด (<name>) จองไม่ได้`. Room-booking date pickers skip holiday days in the day list.
10. **ปฏิทินทุกหน้า** (rooms week/month, fleet, leave) colour holiday cells grey (`--holiday-bg`) and print the holiday name.

## Security
Password and connection URL never appear in logs, audit metadata, URLs or API responses. Only admins with the admin module can read/save settings or trigger sync (server-checked).

## Added during the session
11. **ช่องกรอกวันที่** every date / date-time field uses one Thai picker (`components/thai-date-input.tsx`): typed วว/ดด/ปปปป พ.ศ. (ISO and ค.ศ. also accepted), popup calendar Monday-first with full Thai weekday and month names, holidays grey and named (refused with `blockHolidays`), keyboard: arrows, Home/End, PageUp/PageDown, Enter, Esc. Values stay ISO (`YYYY-MM-DD`, `YYYY-MM-DDTHH:mm`), so no API changed. Time is a 24-hour quarter-hour select.
12. **Font** decided: `--font-family: Tahoma, 'Noto Sans Thai', sans-serif`, Noto Sans Thai loaded from Google Fonts in place of Kanit.
