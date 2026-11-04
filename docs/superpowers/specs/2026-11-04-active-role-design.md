# เลือกบทบาทก่อนเข้าใช้ระบบ (active role) — design

Request: "ถ้าผู้ใช้มีหลายบทบาทต้องเลือกบทบาทก่อนเข้าใช้ระบบ". Superpowers skills were followed by hand (brainstorming defaults were set by the coordinator).

## Behaviour

- Every signed-in person always has the baseline rights of **บุคลากรทั่วไป** (own requests, own profile). These are not roles in `role_assignment`.
- The *choices* are the distinct role names a person holds in `role_assignment` (`admin`, `hr-manager`, `hr-reader`, `leave-manager`, `travel-manager`, `room-manager`, `room-booking-approver`, `inventory-officer`, `inventory-supervisor`, `fleet-manager`, `data-exporter`, `<module>-tester`). One role name with several unit assignments is one choice and keeps all its unit scopes.
- 0 roles: no picker, active role is บุคลากรทั่วไป. 1 role: no picker, that role is selected automatically.
- 2+ roles: until a choice is saved, every app page redirects to `/choose-role` and every API (except sign-in/out, password change, the choose-role API and health) answers `403 {"error":"role_selection_required"}`. The picker lists each held role as a card button (Thai name + short description) plus **บุคลากรทั่วไป** (`employee`, baseline only).
- The choice is stored on the server session (`user_session.active_role`). On every request the session subject's `roles` are filtered to the active role only, so authorization (`AuthorizationService`), navigation, module visibility and DEVELOPMENT-mode visibility (`canUseModule`) all see baseline + active role and nothing else. While a choice is pending the subject has no roles at all (deny by default even if the proxy is bypassed).
- The server refuses a role not held (`403 role_not_held`). A stored role that has since been removed is ignored; a person who still has 2+ roles goes back to the picker; with 0–1 left it auto-selects.
- Data-owner assignments are not choices: they only gate permissions a role already grants, so they stay attached and take effect only through the active role.
- Profile chip shows the current role (for people who hold at least one role) and, for people with 2+ roles, a "เปลี่ยนบทบาท" link to the picker. Saving a choice writes audit event `session.role.selected` (metadata: `{ roleName, previousRoleName }` — role codes only).
- Every audit event records `audit_event.actor_role`: the active role of the actor's most recently used live session at write time (null for บุคลากรทั่วไป/no session). Known limit: a person with two concurrent sessions in different roles is attributed to the most recently used one.
- Login page is not restyled (PR #70 owns it); login still goes to `/dashboard` and the proxy forwards to the picker.

## Out of scope
Per-unit choice within one role name; remembering the last choice across sign-ins.
