# โปรไฟล์ผู้ใช้มุมขวาบน — design

Superpowers skills were followed by hand in a delegated session; the behaviour below was agreed with the requester before code.

## Behaviour

- Every signed-in page shows a profile chip at the top right: photo (or initials), display name and ตำแหน่งงาน.
- The chip replaces the notification bell. When unread notices exist the chip carries the count badge; the menu lists only unread notices. Opening one PATCHes `/api/notifications/{id}/read`, navigates to the returned href and the notice disappears. The menu always links to `/hr/me` (ข้อมูลส่วนตัว) and `/notifications`.
- `/hr/me` lets the person edit their own **ข้อมูลส่วนตัว** (คำนำหน้า, ชื่อ, นามสกุล, เพศ, วันเกิด), their **ข้อมูลติดต่อ** (unchanged) and a profile photo. **ข้อมูลงาน** stays read-only for self; only HR edits it, as before.

## Server

- `HrProfileService.updateOwnPersonal(personId, input, actor)` takes personal fields only (`updateOwnPersonalInputSchema`, strict), refuses unless `actor.personId === personId`, locks the person, writes through `applyProfileUpdate` (keeps `person.display_name` in sync) and records `hr.person.personal.update` with changed field names only, in one transaction.
- `PUT /api/hr/me/personal` takes the person from the session; any `personId` in the body is dropped.
- Photo: migration `0017_person_photo.sql` adds nullable `hr_person_profile.photo_attachment_id` (FK to `attachment`). `POST /api/hr/me/photo` (multipart `file`) accepts `image/jpeg`, `image/png`, `image/webp` up to 2 MB, stores it as a ไฟล์แนบส่วนตัว (scan + private storage) and sets it with `HrProfileService.setOwnPhoto`, audited as `hr.person.photo.update` (`changedFields: ['photo']`). `DELETE` removes it.
- `GET /api/hr/people/{personId}/photo` serves a person's current photo to any signed-in user. The URL carries only the person id and the attachment id as a cache key. Photos are not audited per view (`recordDownload: false`) because the chip loads on every page.
- Without object storage the chip shows initials and the upload control says uploads are unavailable.

## Shell

`ShellData.profile = { displayName, positionTitle, photoUrl }` loaded in `loadShellData`; a failure logs a code and falls back to nulls.
