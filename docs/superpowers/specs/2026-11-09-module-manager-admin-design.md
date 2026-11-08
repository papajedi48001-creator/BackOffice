# ผู้จัดการโมดูลมีสิทธิ์เทียบเท่าผู้ดูแลระบบในโมดูลของตน — design

Request: "ผู้จัดการโมดูลให้มีสิทธิ์เทียบเท่า admin ในโมดูลที่ตัวเองรับผิดชอบ". Superpowers skills were followed by hand (brainstorming defaults set by the coordinator).

## Behaviour

- A **ผู้จัดการโมดูล** is a person whose active role is the hospital-wide (`organization_id` NULL) manager role of a module (`moduleManagerRoles`). A unit-scoped assignment of the same role is not a ผู้จัดการโมดูล.
- For every permission that belongs to a module they manage, `AuthorizationService` treats them exactly like a ผู้ดูแลระบบ: `canAccess` allows any unit, `organizationScope` is `all`, `canActHospitalWide` is true, and the เจ้าของข้อมูล (data-owner) gate is skipped — the same deliberate exception the admin already has.
- Permissions of other modules get nothing extra: they go through the normal role, unit-scope and data-owner checks.
- Implemented once, centrally, from an explicit permission → module map (`permissionModules` in `@backoffice/contracts`). Every page, API, navigation entry and helper (`canManageLeave`, `canManageTravel`, `canManageFleet`, `canInventory`, `profileAccess`, …) already routes through `AuthorizationService`, so they all follow.
- DEVELOPMENT-mode visibility: unchanged — `canUseModule` already lets a module's ผู้จัดการ in.
- ผู้ทดสอบ of their own module: a ผู้จัดการโมดูล may grant and revoke the `<module>-tester` role of a module they manage through the existing single-role APIs (`POST /api/admin/people/{id}/roles`, `DELETE /api/admin/people/{id}/roles/{role}`); same audit event and transaction as the admin. Every other role is refused (403).
- Stays ผู้ดูแลระบบ-only: ตั้งค่าการเชื่อมต่อ (HOSxP, LINE), ตั้งค่าโปรแกรม (module modes), granting admin/manager roles, the whole-role-set API (`PUT …/roles`), the person search, admin pages and the admin audit log, support chat.
- The rule follows the active role (see 2026-11-04-active-role-design): only the manager role the session works in counts.

## Permission → module map

| Permission | Module | Manager role |
|---|---|---|
| `hr.person.read`, `hr.person.manage`, `hr.organization.manage`, `hr.person.private.read` | `hr` | `hr-manager` |
| `leave.manage` | `leave` | `leave-manager` |
| `travel.manage` | `official-travel` | `travel-manager` |
| `room.manage`, `room.booking.decide` | `room-booking` | `room-manager` |
| `inventory.item.manage`, `inventory.stock.receive`, `inventory.stock.read`, `inventory.opening.certify` | `inventory` | `inventory-officer` |
| `fleet.manage` | `fleet` | `fleet-manager` |
| `data.export` | the module of the resource being exported (`resource.moduleCode`, or the `moduleCode` passed to `canActHospitalWide`) | that module's manager |

Note: `hr-manager` also holds `leave.manage` and `travel.manage` by role; those belong to `leave`/`official-travel`, so for an hr-manager they keep the HR data-owner gate.

## Consequences

- `hr-manager`, `leave-manager`, `travel-manager` held hospital-wide no longer need the HR เจ้าของข้อมูล assignment inside their own module.
- `inventory-officer` gains `inventory.opening.certify` (previously supervisor-only).

## Out of scope
Admin UI for managers to pick testers (API only for now); per-unit managers.
