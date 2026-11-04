# HR uploads a person's profile photo — design

## Behaviour
- The "แก้ไขข้อมูลส่วนตัวและข้อมูลงาน" popup (ProfileForm, HR with `editProfile`) shows the person's รูปประจำตัว at the top: the current photo or initials, a file picker (JPEG/PNG/WebP, ≤ 2 MB) and, when a photo exists, a "ลบรูป" checkbox.
- On บันทึกข้อมูล the chosen photo is uploaded first (or removed), then the profile fields are saved. A photo error keeps the popup open with the message.
- When object storage is not configured the popup shows the existing "ยังอัปโหลดรูปไม่ได้" note and no picker.

## Server
- `HrProfileService.setPersonPhoto(personId, attachmentId | null, actor)`: allowed only when `profileAccess(actor, subject).editProfile`; the file must have been uploaded by the actor and be an allowed image type and size. Same table, same audit action `hr.person.photo.update` with `{ changedFields: ['photo'] }`, actor = the HR person. Runs in one transaction.
- `POST /api/hr/people/[personId]/photo` (multipart `file`) and `DELETE` on the same route. Same limits and error codes as `/api/hr/me/photo`.
- No file content or name goes into audit metadata or logs.
