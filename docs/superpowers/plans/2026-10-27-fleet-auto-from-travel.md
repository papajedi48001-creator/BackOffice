# Plan: ใบขอใช้รถจากไปราชการแบบอัตโนมัติ

Spec: `docs/superpowers/specs/2026-10-27-fleet-auto-from-travel-design.md`. This is a small change, executed inline with TDD.

## Task 1: `FleetRequestService.fileFromTravelDecision`

Files:
- `packages/core/src/fleet/fleet-request-service.ts`
- `packages/core/src/fleet/fleet-store.ts` (`FleetHistoryAction` gains `FILED_FROM_TRAVEL`)
- `packages/core/src/fleet/fleet-request-service.integration.test.ts`

Interface: `fileFromTravelDecision(requestId, actorPersonId): Promise<{ fleetRequestId: string | null }>`.

- [x] Write failing integration tests covering: filing for the หัวหน้าคณะ with the default times, history, audit and notice; at most one ใบ per trip; half-day times; falling back to an approved member; and nothing filed while someone is in review, for a private car, after the trip ended, or for a non-travel คำขอ.
- [x] Implement, then see the tests pass:
  `DATABASE_URL=… npx vitest run --config vitest.integration.config.ts src/fleet/fleet-request-service.integration.test.ts`

## Task 2: Decision route calls it

Files:
- `apps/web/src/app/api/requests/[requestId]/decisions/route.ts`
- `apps/web/src/app/api/requests/[requestId]/decisions/route.test.ts`

- [x] Write failing tests. The route files after APPROVE or REJECT on an `official-travel` คำขอ. It does nothing after RETURN, for another module, or when the decision is refused. A failed filing keeps the decision and logs only the error code.
- [x] Implement, then see the tests pass.

## Task 3: History label

Files:
- `packages/i18n/src/th.ts`
- `apps/web/src/lib/fleet-labels.ts`
- `packages/core/src/fleet/fleet-queries.ts` (`ACTION_ORDER`)
- the fleet request page test

- [x] Write a failing page test for "สร้างจากคำขอไปราชการที่อนุมัติแล้ว", then add the label.

## Verification

- [x] `pnpm lint && pnpm typecheck && pnpm test`
- [x] `pnpm test:integration` with `DATABASE_URL`
- [x] `bash infra/backup/restore-verify.test.sh`
- [x] `git diff --check`
