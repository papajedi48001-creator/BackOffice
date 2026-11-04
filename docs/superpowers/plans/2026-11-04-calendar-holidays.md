# Calendar & holidays — plan (2026-11-04)

Spec: `docs/superpowers/specs/2026-11-04-calendar-holidays-design.md`. Verify each task with `pnpm --filter <pkg> test` then the full suite.

- [x] 1. Formatters: test `formatBangkokDate('2026-11-09') === 'จันทร์ 9 พ.ย. 2569'`, date-time, full weekday headers; implement in `lib/bangkok-time.ts`; replace ad-hoc `Intl` date formats in pages.
- [x] 2. Calendar headers full names + larger day numbers + holiday cell rendering (tests on rooms month grid / fleet / leave calendar).
- [x] 3. Font variable + Noto Sans Thai; sticky module header CSS.
- [x] 4. Migration `0029_holiday_sync.sql` + Drizzle schema + `migrate.ts` list (migrate.test).
- [x] 5. Core `holidays/`: `mapHolidayRows` (fake rows test), `HolidaySyncService` (upsert, keeps MANUAL), `HosxpSettingsService` (encrypt, never return password), `findHolidays`.
- [x] 6. Rooms + fleet rejection (`BOOKING_ON_HOLIDAY`) tests in service/route; UI message.
- [x] 7. Admin connections: HOSxP form (FormDialog), test & sync API routes (admin-only).
- [x] 8. Worker daily sync loop (test with fake timer/sync).
- [x] 9. Verification: `pnpm lint && pnpm typecheck && pnpm test`, `bash infra/backup/restore-verify.test.sh`, `git diff --check`.
- [x] 10. (added mid-task) Shared Thai date picker `ThaiDateInput` / `ThaiDateTimeInput` replaces every native date and datetime-local input; tests in `components/thai-date-input.test.tsx`.

Notes: production/staging compose files were not changed; enabling HOSxP in production needs `CONNECTION_SECRET_KEY` and/or `HOSXP_DATABASE_URL` added per `docs/runbooks/deploy.md` with Data Owner approval.
