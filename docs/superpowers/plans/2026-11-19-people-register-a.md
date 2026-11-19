# ทะเบียนบุคลากร แบบ A: plan

Spec: docs/superpowers/specs/2026-11-19-people-register-a-design.md

- [x] Task 1 contracts/core: TRANSFERRED status, SELF_STATUS, employee code locked, account without password (tests: person-account-service integration, contracts).
- [x] Task 2 directory 2FA flags + migration 0045 (test: hr-directory integration, migrate.test).
- [x] Task 3 web list: labels, switch, 2FA logos, pencil (test: people-table.test).
- [x] Task 4 web popup route + forms: no password fields, temp-password alert, read-only code, no self status (tests: hr-account-forms, people page).
- [x] Verify: `pnpm lint && pnpm typecheck && pnpm test`, integration with DATABASE_URL, `git diff --check`.
