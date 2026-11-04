# Calendar & holidays — plan (2026-11-04)

Spec: `docs/superpowers/specs/2026-11-04-calendar-holidays-design.md`. Verify each task with `pnpm --filter <pkg> test` then the full suite.

- [ ] 1. Formatters: test `formatBangkokDate('2026-11-09') === 'จันทร์ 9 พ.ย. 2569'`, date-time, full weekday headers; implement in `lib/bangkok-time.ts`; replace ad-hoc `Intl` date formats in pages.
- [ ] 2. Calendar headers full names + larger day numbers + holiday cell rendering (tests on rooms month grid / fleet / leave calendar).
- [ ] 3. Font variable + Noto Sans Thai; sticky module header CSS.
- [ ] 4. Migration `0029_holiday_sync.sql` + Drizzle schema + `migrate.ts` list (migrate.test).
- [ ] 5. Core `holidays/`: `mapHolidayRows` (fake rows test), `HolidaySyncService` (upsert, keeps MANUAL), `HosxpSettingsService` (encrypt, never return password), `findHolidays`.
- [ ] 6. Rooms + fleet rejection (`BOOKING_ON_HOLIDAY`) tests in service/route; UI message.
- [ ] 7. Admin connections: HOSxP form (FormDialog), test & sync API routes (admin-only).
- [ ] 8. Worker daily sync loop (test with fake timer/sync).
- [ ] 9. Verification: `pnpm lint && pnpm typecheck && pnpm test`, `bash infra/backup/restore-verify.test.sh`, `git diff --check`.
