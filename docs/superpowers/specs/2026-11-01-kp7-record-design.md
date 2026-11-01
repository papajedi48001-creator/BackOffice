# ประวัติตามแบบ ก.พ.7 และไฟล์ ก.พ.7

Status: requested by wasan on 2026-11-01: "สามารถแก้ไขข้อมูลส่วนตัวได้ตามโครงสร้าง กพ.7 และสามารถอัพโหลดไฟล์ กพ.7 ได้". wasan attached a sample ก.พ.7 printed from the ministry system and said "ต่อเลย" (go ahead), so this design follows the recommended choices below without further questions. The sample contains a real person's data. None of it is copied into code, tests or docs.

## What the ก.พ.7 holds

The printed form has four parts:

1. **ข้อมูลการปฏิบัติราชการ**:
   - ตำแหน่งเลขที่, ตำแหน่ง, ประเภท, ระดับ, เงินเดือน
   - ต้นสังกัด, ปฏิบัติงานจริง, กบข.
   - วันที่บรรจุครั้งแรก, บรรจุกลับ, รับโอน, ให้โอน
   - วันเข้าสู่หน่วยงานปัจจุบัน, วันเข้าสู่ระดับปัจจุบัน
   - วุฒิในตำแหน่ง, สาขา/วิชาเอก, เงินเพิ่มพิเศษ
   - วันเกษียณอายุ, which is computed.
2. **ข้อมูลส่วนตัวและครอบครัว**:
   - สถานภาพ, ศาสนา, ภูมิลำเนา
   - บิดา, มารดา, สกุลเดิมของมารดา
   - คู่สมรส, สกุลเดิมของคู่สมรส
   - จำนวนบุตร
3. **ตำแหน่งและอัตราเงินเดือน**: one row per order. Each row has a date, the description, ตำแหน่งเลขที่, ประเภท, ระดับ, เงินเดือน, เงินประจำตำแหน่ง and เอกสารอ้างอิง.
4. **ข้อมูลการศึกษา**: one row per degree. Each row has the graduation date, วุฒิ, สาขา/วิชาเอก, สถาบัน and ประเทศ.

## Who may do what

- Everything in the ก.พ.7 is private: salary, family and the file. Only those who already see a person's private boxes may see it, which means the person themself and an HR manager who owns HR data (`viewPrivate`). An hr-reader sees none of it.
- **Part 2 (ส่วนตัวและครอบครัว), part 4 (การศึกษา) and the ก.พ.7 file**: the person themself and HR (`editContact`) may edit them. This is the "แก้ไขข้อมูลส่วนตัว" in the request.
- **Part 1 (การปฏิบัติราชการ) and part 3 (ตำแหน่งและเงินเดือน)**: these record official orders, so only HR (`editProfile`) edits them. The person sees them read-only.
- Audit events name the changed fields only. They never hold values, so no salary, name of a relative or file name ever reaches audit metadata.

## The ก.พ.7 file

- **Format and size:** the file must be a PDF (the ministry system prints PDF), up to 10 MB. It is stored through the existing ไฟล์แนบส่วนตัว pipeline: object storage and a ClamAV scan.
- **Upload and replace:** each person keeps one current file. Uploading again replaces it, and HR or the person can remove it.
  - The uploader must be the person themself or HR, and the file must be one that actor uploaded (the existing rule).
- **Download:** the file is opened through `/api/attachments/<id>/download`. A viewer may download it when they may see that person's private boxes (`AttachmentAccess`).
- **Audit:** `hr.person.kp7.update` with `changedFields: ['kp7File']`.
- **Profile page:** shows that the file exists, when it was uploaded, and a link to open it.

## Delivery

The work ships as three PRs, in this order:

1. **Part 2 and the ก.พ.7 file.** Migration 0022 adds the family columns and `kp7_attachment_id` to `hr_person_profile`. Then come `updateFamily` and `setKp7File`, the routes, the forms on the profile page, and the history labels.
2. **Part 1 and part 4.** Part 1 adds civil-service columns, and วันเกษียณอายุ is computed as 1 ต.ค. of the year the person turns 60 (the next year when born after 1 ต.ค.). Part 4 adds an `hr_person_education` table with the person and HR able to edit it.
3. **Part 3.** An `hr_person_position_history` table that only HR edits. The rows are listed in date order, as on the form.

## Not in this round

- **Reading the uploaded PDF to fill the fields automatically.** The ministry's PDF has a text layer, so this could come later as an HR "นำเข้าจากไฟล์ ก.พ.7" step that shows what it found before saving.
- **Printing a ก.พ.7 from the system.**
