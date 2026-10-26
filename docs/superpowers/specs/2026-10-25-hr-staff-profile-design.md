# ทะเบียนประวัติบุคลากร (HR staff profile) — design

Status: approved by wasan (2026-10-22). Sub-project 2 of the HR module; follows the command chain (PR #18).

## Goal

Give every **บุคลากร** one profile page holding personal details, contact details and work details, so HR keeps the record in one place and the coming leave and official-travel modules can read employment type and appointment date.

## Decisions agreed with wasan (2026-10-22)

1. First round covers personal details, employment details, change history and a per-person profile page. Education, professional licences and training are later rounds.
2. Staff edit their own contact details directly; HR edits everything else.
3. Two visibility tiers: work details follow the existing `hr.person.read` organization scope; personal and contact details are visible only to the person themself and HR managers.
4. Employment types start as six values and HR can add, rename or deactivate them: ข้าราชการ, พนักงานราชการ, พนักงานกระทรวงสาธารณสุข (พกส.), ลูกจ้างประจำ, ลูกจ้างชั่วคราว, ลูกจ้างรายวัน.
5. Only current values are stored. History is read from audit events.
6. Gender is set automatically from the name prefix, and HR can override it.

## Data

### Fields

| Group | Field | Who edits | Who sees |
|---|---|---|---|
| ข้อมูลส่วนตัว | name prefix, first name, last name, gender, date of birth | HR manager | the person, HR manager |
| ข้อมูลติดต่อ | phone, address, emergency contact name, relationship, phone | the person, HR manager | the person, HR manager |
| ข้อมูลงาน | employment type, appointment date (วันบรรจุ), position title, position level (free text), organization | HR manager | `hr.person.read` within its organization scope, the person |

Existing fields stay where they are: `person.display_name`, `person.position_title`, `person.employment_status`, `person.employee_code` and the open `employment_assignment` row for the organization. When HR saves first or last name, `display_name` is rewritten as `<prefix><first name> <last name>` so every other screen keeps working.

### Migration `0010_hr_staff_profile.sql` (additive)

```sql
CREATE TABLE IF NOT EXISTS hr_employment_type (
  id CHAR(36) PRIMARY KEY, code VARCHAR(32) NOT NULL, name VARCHAR(120) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1, sort_order INT NOT NULL,
  created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
  UNIQUE KEY hr_employment_type_code_unique (code), UNIQUE KEY hr_employment_type_name_unique (name)
) DEFAULT CHARSET=utf8mb4;
INSERT IGNORE INTO hr_employment_type (...) VALUES  -- six seed rows with fixed UUIDs and codes
  CIVIL_SERVANT, GOVERNMENT_EMPLOYEE, MOPH_EMPLOYEE, PERMANENT_EMPLOYEE, TEMPORARY_EMPLOYEE, DAILY_EMPLOYEE;
CREATE TABLE IF NOT EXISTS hr_person_profile (
  person_id CHAR(36) PRIMARY KEY,
  name_prefix VARCHAR(32) NULL, first_name VARCHAR(120) NULL, last_name VARCHAR(120) NULL,
  gender VARCHAR(8) NULL, birth_date DATE NULL,
  phone VARCHAR(32) NULL, address VARCHAR(500) NULL,
  emergency_contact_name VARCHAR(255) NULL, emergency_contact_relationship VARCHAR(64) NULL, emergency_contact_phone VARCHAR(32) NULL,
  employment_type_id CHAR(36) NULL, appointed_on DATE NULL, position_level VARCHAR(120) NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT hr_person_profile_person_fk FOREIGN KEY (person_id) REFERENCES person(id),
  CONSTRAINT hr_person_profile_employment_type_fk FOREIGN KEY (employment_type_id) REFERENCES hr_employment_type(id)
) DEFAULT CHARSET=utf8mb4;
```

A separate profile table keeps personal data out of `person`, which every module joins, so a careless `SELECT` elsewhere cannot pick it up. `birth_date` and `appointed_on` are calendar dates (`DATE`), not instants, so they need no time-zone conversion. Drizzle schema, `migrate.ts`, `docs/integration/modules.md` and `restore-verify.sh` follow.

### Name prefix and gender

`packages/contracts` holds a prefix-to-gender table: นาย, นพ., ทพ., ภก. → `MALE`; นาง, นางสาว, พญ., ทญ., ภญ. → `FEMALE`. The prefix is free text (up to 32 characters) so ranks such as ว่าที่ร้อยตรี still fit. On save, when the prefix is in the table and the request does not give a gender, the gender is taken from the table. When the prefix is not in the table, the gender must be given. A gender the request gives always wins, so HR can override. The form fills the gender as soon as a known prefix is chosen.

## Access

New permission `hr.person.private.read`, granted to `hr-manager` only, and counted in `requiresDataOwner` like the other HR manager permissions.

| Action | Rule (server side) |
|---|---|
| See work details of person P | `hr.person.read` scope includes P's organization, or P is the session person |
| See personal and contact details of P | `hr.person.private.read` scope includes P's organization, or P is the session person |
| Edit personal or work details of P | `hr.person.manage` scope includes P's organization |
| Edit contact details of P | P is the session person, or `hr.person.manage` covers P |
| Manage employment types | `hr.person.manage` hospital-wide |

A reader without private access never receives the private fields: the server leaves them out of the response, rather than the page hiding them.

## Change history

Each save writes one audit event in the same transaction as the update:

- `hr.person.profile.update` (personal and work details), `hr.person.contact.update` (contact details), `hr.employment_type.create` / `.update`.
- Metadata `changedFields`: the names of the fields that changed. A save that changes nothing writes no event.
- Metadata `workChanges`: `{ field: { from, to } }` for work fields only (employment type name, appointment date, position title, position level, organization name). Personal and contact values are never written to audit metadata. `workChanges` is added to the redact allowlist.

The profile page lists these events for the person, newest first: when, who, which fields, and for work fields the old and new value. Readers without private access see the work entries and see that personal or contact details changed, without values.

## Screens (inside the existing HR module sections)

- **/hr/people**: adds an employment type column; each name links to the profile.
- **/hr/people/[personId]**: boxes for ข้อมูลงาน, ข้อมูลส่วนตัว, ข้อมูลติดต่อ and ประวัติการเปลี่ยนแปลง. The private boxes are absent when the viewer lacks access. HR managers get an edit form per box.
- **/hr/me** (new section "ประวัติของฉัน", visible to everyone signed in): the same page for the session person, with the contact form editable.
- **/hr/employment-types** (section for HR managers): list, add, rename, activate or deactivate. A type in use cannot be deleted; there is no delete.
- **Master data import**: the people file accepts optional columns `name_prefix`, `first_name`, `last_name`, `gender`, `birth_date`, `employment_type` (code or Thai name), `appointed_on`, `position_level`. Errors name the cell only, never its value. New error codes: `UNKNOWN_EMPLOYMENT_TYPE`, `INACTIVE_EMPLOYMENT_TYPE`, `INVALID_GENDER`, `GENDER_REQUIRED`.

## API

- `GET` is done in server components through `HrProfileService`; no profile JSON endpoint is needed.
- `PUT /api/hr/people/[personId]/profile` — personal and work fields (HR manager).
- `PUT /api/hr/me/contact` — contact fields for the session person; the person id comes only from the session.
- `PUT /api/hr/people/[personId]/contact` — contact fields (HR manager).
- `POST /api/hr/employment-types`, `PUT /api/hr/employment-types/[id]`.

Inputs are zod schemas in `packages/contracts/src/hr.ts`. Dates are `YYYY-MM-DD` and must be real calendar dates (2026-02-30 is rejected). Birth date cannot be in the future. Phone is digits, spaces, `-` and `+`, up to 32 characters.

## Core services (`packages/core/src/hr`)

- `HrProfileService.get(personId, viewer)` returns `{ work, private?: { personal, contact }, history }` following the access table.
- `HrProfileService.updateProfile(input, actor)`, `updateContact(input, actor)`: lock the person row `FOR UPDATE`, compute changed fields, write profile, `person` columns, assignment (an organization change closes the open assignment and opens one effective today, as the import does), and the audit event in one transaction.
- `EmploymentTypeService.list/create/update`.
- `getEmployment(personId)` returning employment type code and appointment date, for the leave module.

## Errors

404 for an unknown person, 403 without the permission, 400 with field-level error codes for invalid input, 409 when an employment type name or code already exists. Messages are Thai and never echo personal values.

## Testing

- Unit: contracts schemas (dates, phone, prefix/gender), gender resolution, changed-field diff, access decisions, import validation of the new columns.
- Integration (MariaDB): profile update writes profile + person + audit in one transaction and rolls back together; contact self-edit cannot touch another person; reader response has no private fields; employment type uniqueness; import of new columns.
- Web: route tests for 401/403/400/200, page tests for private boxes hidden from readers, `/hr/me` visible to everyone.

## Out of scope

Education, licences, training, a dated position timeline, editing contact details through CSV, showing HR events on `/access/audit`.
