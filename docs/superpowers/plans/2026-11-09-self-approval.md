# Self-approval in the admin/manager tier — plan

Spec: `docs/superpowers/specs/2026-11-09-self-approval-design.md`.

- [x] Task 1 — core rule: `canDecideOwnRequest` in `access/active-role.ts`. Failing test: `active-role.test.ts`.
- [x] Task 2 — workflow: `ApprovalService.decideRequest` accepts `actorRole`, requires a reason on own requests, tags `selfApproval` (allow-listed in `audit/redact.ts`). Failing tests: `approval-service.test.ts` "own request (self-approval)".
- [x] Task 3 — room booking: `RoomActor.activeRole`, `RoomBookingService.decide`, `pendingForApprover`. Failing tests: `room-booking-service.test.ts`.
- [x] Task 4 — queues: leave/travel `pendingForApprover`/`pendingCount` `includeOwn`, detail `canDecide`/`ownRequest`, `listPendingApprovals.ownRequest`.
- [x] Task 5 — web: decisions route tier, `request-access`, `booking-state`, `actor.ts`, marker component and dialogs, approvals pages, badges. Failing tests: route, request-access, booking-state, leave/travel approvals pages.
- [x] Task 6 — admin list `/access/self-approvals` + `listSelfApprovals`. Failing tests: page + core query.
- [x] Task 7 — docs: CONTEXT.md, DESIGN.md, CLAUDE.md.

Verification: `pnpm lint && pnpm typecheck && pnpm test`, `git diff --check`, `grep -rn '^<<<<<<<\|^>>>>>>>' apps packages`.
