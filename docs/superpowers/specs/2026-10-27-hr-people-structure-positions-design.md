# HR: create users, manage กลุ่มงาน/งาน, and the position catalogue

Status: requested by wasan on 2026-10-27 (9 points, with a screenshot of the person edit form). The decisions marked **Ruling** were made by Claude so the work could start; wasan can overturn any of them.

## What wasan asked for

1. HR has a button that creates a new user.
2. HR can edit everything about a user except the username.
3. HR can create, edit and delete กลุ่มงาน and งาน. When one is deleted, the people in it have no unit (ไม่มีสังกัด).
4. Positions and levels are imported from the Ministry of Public Health (กระทรวงสาธารณสุข).
5. A position and its level must match the ก.พ. structure. For example, a เจ้าพนักงาน position takes the ปฏิบัติงาน level, not ปฏิบัติการ.
6. HR can close, open, add, edit and delete positions.
7. The position and level fields suggest values while the person types.
8. The หน่วยงาน field becomes กลุ่มงาน, and it suggests values while typing.
9. A new field offers the งาน that belong to the chosen กลุ่มงาน.

## Who may do what

- Every action is checked on the server.
- Creating a user, managing positions, and managing กลุ่มงาน/งาน all need hospital-wide `hr.person.manage` or `hr.organization.manage`, plus Data Owner of the `hr` module. This matches how employment types are managed today.
- Editing a person keeps today's rule (`profileAccess(...).editProfile`).
- Replacing a national ID or setting a new password also needs `hr.person.private.read` coverage.

## 1. ตำแหน่งงาน catalogue (points 4–7)

### Tables

New table `hr_position`:
- `id`
- `name`, unique
- `category`: one of `GENERAL`, `ACADEMIC`, `DIRECTOR`, `EXECUTIVE`, `NONE`
- `allowed_levels`: a JSON array of level names, in ascending order
- `is_active`
- `sort_order`
- timestamps

`hr_person_profile` gains `position_id`, which is nullable.

`person.position_title` remains the display text. Other modules read it, so it is kept equal to the catalogue name.

### Levels

The levels come from the ก.พ. structure and are fixed in code:

| Category | Levels |
| --- | --- |
| ทั่วไป `GENERAL` | ปฏิบัติงาน, ชำนาญงาน, อาวุโส, ทักษะพิเศษ |
| วิชาการ `ACADEMIC` | ปฏิบัติการ, ชำนาญการ, ชำนาญการพิเศษ, เชี่ยวชาญ, ทรงคุณวุฒิ |
| อำนวยการ `DIRECTOR` | ต้น, สูง |
| บริหาร `EXECUTIVE` | ต้น, สูง |
| ไม่มีระดับ `NONE` | — (for example พนักงานขับรถยนต์, ผู้ช่วยเหลือคนไข้) |

Each position allows a contiguous subset of its category's levels. For example, พยาบาลวิชาชีพ allows ปฏิบัติการ to เชี่ยวชาญ, and เจ้าพนักงานธุรการ allows ปฏิบัติงาน to อาวุโส.

### The match rule (point 5)

- The level may be left empty. พนักงานราชการ and ลูกจ้าง often hold a civil-service position name without a level.
- If a level is given, it must be one of the position's `allowed_levels`. Otherwise the server answers `LEVEL_NOT_ALLOWED`.
- A position with category `NONE` takes no level.

### Initial list (point 4)

- Migration seeds the common สายงาน of a MOPH community hospital: about 45 civil-service positions with their usual level ranges, plus common employee positions with no level.
- **Ruling:** I have no file from the ministry, so the seed is written from the ก.พ. / MOPH สายงาน as I know them. The positions page says so, and HR should check it.
- HR can also import a CSV with the columns `name,category,levels,active`. This lets HR load the ministry's official list when it arrives.
- Importing adds or updates by name and never deletes.

### Managing positions (point 6)

There is a positions page at `/hr/positions`, where HR can:
- add a position;
- edit its name, category and allowed levels;
- close or open it. A closed position is not offered for new choices, but people who already hold it keep it;
- delete it, only when nobody holds it. Otherwise the answer is `POSITION_IN_USE`, and the page suggests closing it instead.

## 2. กลุ่มงาน and งาน (points 3, 8, 9)

### Structure

- A กลุ่มงาน is an `organization` with `unit_type = DIVISION`.
- A งาน is an `organization` with `unit_type = SECTION` whose parent is a กลุ่มงาน.
- The hospital is the root.

### Managing units

On `/hr/organizations`, HR can:
- add a กลุ่มงาน, or a งาน under a chosen กลุ่มงาน;
- rename a unit;
- move a งาน to another กลุ่มงาน;
- delete a unit.

### Deleting a unit (point 3)

Deletion is soft: `organization.deleted_at` is set, and `code` is cleared so the code can be reused. Rows elsewhere still point at the unit, so history keeps its name.

One transaction does all of the following:
1. Deletes the unit. Deleting a กลุ่มงาน also deletes its งาน. **Ruling:** the confirmation shows how many งาน and people are affected.
2. Closes every open `employment_assignment` in the deleted units. Those people now have no open assignment, which is ไม่มีสังกัด.
3. Ends any current head term (`hr_organization_head`) of those units.
4. Writes one audit event per unit, with counts only.

After deletion:
- Deleted units are hidden from every list and picker.
- Old requests still show the name they were filed under.
- A person with no unit cannot file leave or travel until HR sets a unit again. Those modules already answer `NO_ORGANIZATION` for that.

### The person form (points 8 and 9)

- "หน่วยงาน" becomes two fields:
  - **กลุ่มงาน**: an input that suggests the names of active กลุ่มงาน while typing.
  - **งาน**: an input that suggests only the งาน under the chosen กลุ่มงาน. It is optional.
- What gets saved: the งาน when one is chosen; otherwise the กลุ่มงาน. Both may be left empty to leave the person ไม่มีสังกัด.
- A name that matches no unit is refused with a Thai message.

## 3. Create and edit a user (points 1, 2)

### Creating a user

The **เพิ่มบุคลากร** button on `/hr/people` opens `/hr/people/new`. The form has:
- national ID (13 digits with a valid checksum, unique);
- employee code (unique, optional);
- name prefix, first name, last name, gender and birth date;
- employment type and appointment date;
- position and level, chosen as in section 1;
- กลุ่มงาน and งาน, chosen as in section 2;
- phone;
- username and initial password (8–128 characters).

Saving creates all of the following in one transaction, with one audit event (`hr.person.create`). The audit carries no national ID and no password:
- the `person` row (the national ID is encrypted, with its lookup hash and mask);
- `hr_person_profile`;
- the assignment;
- the `local_account` (password hashed with scrypt, as login does).

### Editing a user

The person page lets HR edit everything except the username, which is shown read-only. That includes:
- employee code;
- employment status: ปฏิบัติงาน or พ้นสภาพ;
- **replace national ID**: the new number is typed in. The current one is never shown in full; only the mask is.
- **set a new password**;
- every field already on the form.

**Ruling:** a user who has no local account yet can be given one here: a username, which cannot change after it is saved, and a password.

## Errors

The Thai messages cover these codes:
- `DUPLICATE_NATIONAL_ID`
- `DUPLICATE_EMPLOYEE_CODE`
- `DUPLICATE_USERNAME`
- `INVALID_NATIONAL_ID`
- `UNKNOWN_POSITION`
- `INACTIVE_POSITION`
- `LEVEL_NOT_ALLOWED`
- `UNKNOWN_ORGANIZATION`
- `SECTION_NOT_IN_DIVISION`
- `POSITION_IN_USE`
- `DUPLICATE_NAME`

## Delivery

The work ships as three pull requests, each merged when CI is green:

| PR | Covers |
| --- | --- |
| A | กลุ่มงาน/งาน management and the two person fields (points 3, 8, 9) |
| B | The position catalogue, seed, CSV import, levels and suggestions (points 4–7) |
| C | Creating a user and editing everything except the username (points 1, 2) |

## Out of scope

- Users changing their own password.
- Assigning roles from the person page.
- Hard-deleting rows.
