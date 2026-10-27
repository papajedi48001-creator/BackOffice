# HR: create users, กลุ่มงาน/งาน, position catalogue — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Ship the 9 HR requests from 2026-10-27 as three PRs.

**Architecture:** New core services, each writing state, audit and outbox in one transaction:
- `OrganizationStructureService` (create, update and soft-delete units);
- `PositionCatalogService` (positions and allowed levels);
- `PersonAccountService` (create a person with an account; edit identity fields).

Each service sits behind Next.js route handlers guarded by `canActHospitalWide`. The client forms use `<input list>` with a `<datalist>` to suggest values while the person types.

**Spec:** `docs/superpowers/specs/2026-10-27-hr-people-structure-positions-design.md`

## Global Constraints

- Migrations are additive and listed in order in `packages/db/src/migrate.ts`.
- Audit metadata never holds a national ID or a password.
- Thai copy goes in `packages/i18n/src/th.ts`.
- Verification commands:
  - `pnpm lint && pnpm typecheck && pnpm test`
  - `DATABASE_URL=… pnpm test:integration`
  - `git diff --check`

## Review Focus

1. Deleting a กลุ่มงาน that has งาน, people and a head. Afterwards every one of those people has no open assignment, and the units disappear from every picker.
2. Saving a person with a งาน whose parent is not the chosen กลุ่มงาน, or with a deleted unit. The save is refused.
3. A level not allowed for the position, or any level for a `NONE` position. The save is refused.
4. A duplicate national ID, username or employee code on create. The save is refused with nothing half-written.
5. A non-HR caller on every new route. The answer is 403.

---

### Task A1: Unit structure service and migration 0017
- [x] Failing integration tests in `packages/core/src/hr/organization-structure-service.integration.test.ts`:
  - create a กลุ่มงาน, and a งาน under it;
  - refuse a duplicate sibling name (`DUPLICATE_NAME`);
  - refuse a งาน whose parent is not a กลุ่มงาน (`PARENT_NOT_DIVISION`);
  - rename a unit, and move a งาน;
  - delete a กลุ่มงาน: its งาน are deleted too, their assignments and head terms are closed, and the audit counts are right;
  - `HrDirectory.listOrganizations` hides deleted units;
  - a profile save to a deleted unit gives `UNKNOWN_ORGANIZATION`.
- [x] Migration `0017_organization_soft_delete.sql`, the Drizzle `deletedAt` field, and the service.
- [x] Commit `feat(hr): add, rename, move and delete กลุ่มงาน and งาน`.

### Task A2: Routes and organizations UI
- [x] Failing route tests for:
  - `POST /api/hr/organizations`;
  - `PUT` and `DELETE /api/hr/organizations/[id]`;
  - the 401, 403 and 400 answers;
  - mapping each error code to its status.
- [x] Failing page tests:
  - the list page has the add-กลุ่มงาน and add-งาน forms;
  - the detail page has rename, move and delete, and the delete confirmation shows the counts.
- [x] Commit `feat(web): manage กลุ่มงาน and งาน`.

### Task A3: กลุ่มงาน and งาน fields on the person form
- [x] Failing tests:
  - `updatePersonProfileInputSchema` accepts `organizationId: null`;
  - saving `null` closes the assignment;
  - the form suggests กลุ่มงาน names, and suggests only the งาน of the chosen กลุ่มงาน;
  - it saves the งาน id when one is chosen, and otherwise the กลุ่มงาน id;
  - it refuses an unknown name.
- [x] Commit `feat(hr): pick กลุ่มงาน and งาน on a person`.
- [x] PR A.

### Task B1: Position catalogue
- [ ] Failing tests:
  - contracts: the levels by category, and an `allowedLevels` value must be a contiguous subset of its category's levels;
  - integration:
    - the seed exists;
    - add, edit, close and open a position;
    - delete it only when unused, otherwise `POSITION_IN_USE`;
    - a CSV import adds or updates by name;
    - a profile save checks the position and level (`UNKNOWN_POSITION`, `INACTIVE_POSITION`, `LEVEL_NOT_ALLOWED`).
- [ ] Migration `0018_hr_position.sql`: the table, the seed, and `hr_person_profile.position_id`.
- [ ] Commit `feat(hr): position catalogue with ก.พ. levels`.

### Task B2: Positions page and person form suggestions
- [ ] Failing tests:
  - the `/hr/positions` page and its routes;
  - the person form suggests positions, and suggests only the allowed levels of the chosen position.
- [ ] Commit `feat(web): manage positions and suggest position and level`.
- [ ] PR B.

### Task C1: Create a person with an account; edit identity fields
- [ ] Failing integration tests:
  - create writes the person, the profile, the assignment, the local account and one audit, with no national ID or password in the audit;
  - a duplicate national ID, username or employee code rolls back everything;
  - edit the employee code and the status;
  - replace the national ID;
  - set a new password, after which login works with it;
  - a username cannot be changed.
- [ ] Commit `feat(hr): create a user and edit everything but the username`.

### Task C2: New-person page and edit forms
- [ ] Failing tests:
  - the people page has a button to add a person;
  - the `/hr/people/new` form and route;
  - the person page has the identity, account and password forms.
- [ ] Commit `feat(web): add a person and edit their account`.
- [ ] PR C.
