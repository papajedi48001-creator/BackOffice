# ลบบุคลากร — design

## Behaviour
- On a person's page, a hospital-wide HR manager (`hr.person.manage`, which includes the HR ผู้จัดการโมดูล via AuthorizationService) or a ผู้ดูแลระบบ sees "ลบบุคลากร". It opens an ActionDialog (danger) to confirm. After deleting, the user goes back to ทะเบียนบุคลากร.
- The delete is soft: `person.deleted_at` is set. Leave, travel, audit and other records that refer to the person stay intact.
- A deleted person no longer shows in ทะเบียนบุคลากร, and their page answers 404. The status changes to INACTIVE (ลาออก), so they cannot sign in, and their sessions are revoked.
- Refused: deleting yourself; for a non-admin, deleting someone who holds a role (PROTECTED_ACCOUNT), as with password reset; deleting a person who is already deleted (NOT_FOUND).

## Server
- Migration `0035_person_soft_delete.sql` adds `person.deleted_at DATETIME NULL`, with the Drizzle schema kept in step.
- `PersonAccountService.deletePerson(personId, actor)` runs in one transaction and writes the audit event `hr.person.delete` with metadata `{}`.
- Route: `DELETE /api/hr/people/[personId]`.
