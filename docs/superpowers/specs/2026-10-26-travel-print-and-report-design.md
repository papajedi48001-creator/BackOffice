# ไปราชการ: print form and post-trip report

Status: approved by wasan ("ทำที่เหลือที่ทำได้", 2026-10-26) as the parts of ไปราชการ that need no other system. Round 1 limits below are my rulings, open to change.

## Vocabulary

- **แบบขออนุมัติไปราชการ (พิมพ์)**: a printable บันทึกข้อความ of one คำขอไปราชการ, for the paper file and for people who still sign on paper.
- **รายงานการไปราชการ**: what the หัวหน้าคณะ writes after the trip: what was learned and how the unit will use it.

## 1. Print form

- Page `/travel/<id>/print`, visible to the same people as the trip page (the query decides on the server).
- A บันทึกข้อความ layout: ส่วนราชการ โรงพยาบาลวาริชภูมิ and the หัวหน้าคณะ's unit, วันที่ (the date the trip was filed, in Bangkok time, Thai Buddhist year), เรื่อง ขออนุมัติเดินทางไปราชการ, เรียน ผู้อำนวยการโรงพยาบาลวาริชภูมิ.
- Body: the หัวหน้าคณะ with the other people (people REJECTED or CANCELLED are left out), เรื่อง, ผู้จัด, สถานที่ and จังหวัด, the dates and number of days, พาหนะ, แหล่งงบประมาณ and the cost estimate per person and in total (per person × people going).
- Each person's approval steps with name, decision and date. Decision reasons are not printed.
- A signature line for the หัวหน้าคณะ.
- A "พิมพ์" button calls `window.print()`. Print CSS hides the app's navigation and the button; A4 portrait, TH Sarabun New when installed, else the app font.
- The trip page links to it.

## 2. Post-trip report

- Table `official_travel_report`: `travel_id` (primary key, foreign key to `official_travel`), `summary` TEXT (1–5000 characters), `application` TEXT (1–5000 characters), `submitted_by_person_id`, `submitted_at`, `updated_at`. Migration 0014.
- Who and when: the หัวหน้าคณะ, once the trip status is APPROVED and its end date is before today in Bangkok. They can edit it later; each save is audited (`official_travel.report.saved`, metadata `{ travelId, firstSave }`, never the text).
- Who reads it: the same people as the trip page.
- No approval: it is a record. Round 1 sends no notification.
- HR's list (`/travel/all`) gains a รายงาน column (ส่งแล้ว / ยังไม่ส่ง / ยังไม่ถึงกำหนด for an approved trip not yet ended / — when no report is expected) and a filter for approved trips that ended with no report.
- "ไปราชการของฉัน" shows ยังไม่ส่งรายงาน next to the leader's ended trips without one.
- API: `PUT /api/travel/<id>/report` with `{ summary, application }`. NOT_FOUND for someone who is not the หัวหน้าคณะ, REPORT_NOT_DUE before the trip has ended or when it is not APPROVED.

## Round 1 limits

- No attachment of certificates or photos (object storage is not set up).
- No reminder when a report is late; HR uses the filter.
- No expense claim (เบิกค่าใช้จ่ายจริง); it needs the rates and rules first.
