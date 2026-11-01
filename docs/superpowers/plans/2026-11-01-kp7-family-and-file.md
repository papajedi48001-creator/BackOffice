# ก.พ.7 part 2 and the ก.พ.7 file: implementation plan

> **For agentic workers:** this plan is executed inline (superpowers:executing-plans). Steps use checkboxes.

**Goal:** Let the person and HR edit ข้อมูลส่วนตัวและครอบครัว as laid out on the ก.พ.7, and keep each person's ก.พ.7 PDF.

**Architecture:**
- New nullable columns on `hr_person_profile`, read only into the private part of `ProfileView`.
- Two `HrProfileService` methods. Both are gated by `editContact` and write the change and its audit in one transaction.
- Two routes under `/api/hr/people/[personId]`.
- Forms in the profile view. Downloads go through the existing attachment route with one more access rule.

**Spec:** `docs/superpowers/specs/2026-11-01-kp7-record-design.md`

## Global constraints

- Audit metadata holds field names only: no relative's name, no religion, no file name.
- The ก.พ.7 file is PDF only, up to 10 MB, through the existing scan-and-store pipeline.
- Only viewers with `viewPrivate` read these fields or download the file.
- Migration 0022 is additive and listed in `migrate.ts`, with the Drizzle schema kept in step.

## Review focus

- An hr-reader (who has `viewWork` but not `viewPrivate`) must not download someone's ก.พ.7 file.
- HR attaching a file the person uploaded, or a file someone else uploaded, must be refused (`INVALID_FILE`).
- A non-PDF attachment must be refused even if the uploader is right.
- Clearing a field (empty string) saves null rather than an empty string.
- จำนวนบุตร accepts only a whole number from 0 to 30.

### Task 1: contracts and migration
- [x] `updatePersonFamilyInputSchema` in `packages/contracts/src/hr.ts`:
  - `maritalStatus` takes SINGLE, MARRIED, DIVORCED, SEPARATED or WIDOWED, and may be nullable or optional.
  - `religion` (64), `birthplace` (255), `fatherName`, `motherName`, `motherMaidenName`, `spouseName` and `spouseMaidenName` (255 each) are optional text.
  - `childrenCount` is an int from 0 to 30, nullable or optional.
  - The schema is strict.
  - Test: valid input parses, and a bad marital status or 31 children are refused.
- [x] Migration `0022_hr_kp7_family.sql` adds the columns plus `kp7_attachment_id` with an FK to `attachment`. Drizzle schema and migrate.ts are updated; the migrate test count goes to 21.

### Task 2: core service
- [x] Integration tests first:
  - updateFamily by self and by HR; refused for hr-reader and other staff.
  - Audit holds changedFields only.
  - setKp7File accepts a PDF the actor uploaded and refuses a non-PDF or another person's upload (INVALID_FILE).
  - Null removes the file. Audit is `hr.person.kp7.update`.
  - `ProfileView.private` carries the family fields and `kp7File` `{ attachmentId, uploadedAt }`.
  - AttachmentAccess lets an HR manager download the file and refuses an hr-reader.
- [x] Implement `updateFamily`, `setKp7File`, `readPrivate`, `profileAuditActions` and `AttachmentAccess`.

### Task 3: web
- [x] Route tests, then implement:
  - `PUT /api/hr/people/[personId]/family`
  - `POST`/`DELETE /api/hr/people/[personId]/kp7` (multipart field `file`, PDF only, 10 MB)
- [x] Component tests, then build `FamilyForm` and `Kp7FileForm`, the read-only family box and history labels. Shown on `/hr/me` and `/hr/people/[id]`.

### Verification
- [x] `pnpm lint && pnpm typecheck && pnpm test`
- [x] `pnpm test:integration` with DB and S3
- [x] Node script tests, the infra shell tests, the web build and `git diff --check`
