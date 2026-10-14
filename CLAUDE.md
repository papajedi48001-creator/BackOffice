# Working in this repository

Back Office for โรงพยาบาลวาริชภูมิ. Thai-first internal system: Next.js web (`apps/web`), outbox worker (`apps/worker`), and shared packages (`packages/contracts`, `packages/core`, `packages/db`, `packages/i18n`) on MariaDB.

## Required workflow for every session

Use the Superpowers workflow for all development work. When the Superpowers skills are installed, invoke them; when they are not, follow the same steps by hand and say so.

1. **Brainstorm and spec** (`superpowers:brainstorming`): agree on behaviour before code. Write the design to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`.
2. **Plan** (`superpowers:writing-plans`): write `docs/superpowers/plans/YYYY-MM-DD-<topic>.md` with files, interfaces, a failing test per task, and exact verification commands. Tick each checkbox only when its step is actually done.
3. **Execute with TDD** (`superpowers:executing-plans` / `subagent-driven-development`, `superpowers:test-driven-development`): write the failing test, watch it fail, implement, watch it pass. One focused Conventional Commit per task.
4. **Debug systematically** (`superpowers:systematic-debugging`): reproduce and find the root cause before changing code.
5. **Review** (`superpowers:requesting-code-review`, `receiving-code-review`) before asking a human to merge.
6. **Verify before claiming done** (`superpowers:verification-before-completion`): run the commands below and report their real output. Never claim a pass for a suite that was skipped.
7. **Finish the branch** (`superpowers:finishing-a-development-branch`): work on a branch, open a PR, never push to `main`.

## Commands

```bash
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test
DATABASE_URL=mysql://backoffice:<password>@127.0.0.1:3306/backoffice pnpm test:integration   # needs MariaDB
pnpm --filter @backoffice/db migrate
bash infra/backup/restore-verify.test.sh
git diff --check
```

Integration suites skip silently without `DATABASE_URL`; say so when reporting results.

## Rules that always apply

- Read `CONTEXT.md` (domain vocabulary) and `DESIGN.md` (UI rules) before naming things or building UI. Use the Thai terms defined there.
- Authorization is enforced on the server for every action; the UI is never the security boundary.
- Never put a national ID, password, token, decision reason, or attachment content in a URL, log, audit metadata, notification, or outbox payload.
- Workflow transitions, audit events, and outbox events are written in one database transaction.
- Migrations are additive and listed in order in `packages/db/src/migrate.ts`; keep the Drizzle schema in `packages/db/src/schema` in step.
- Store UTC in the database and display Asia/Bangkok time.
- Production deploys follow `docs/runbooks/deploy.md` and need Data Owner approval; CI and image builds are not approval.
