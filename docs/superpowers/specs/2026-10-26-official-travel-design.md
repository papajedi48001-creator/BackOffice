# ไปราชการ (official travel) — design

Status: draft for wasan's review. This is sub-project 4 of the HR scope. It builds on the command chain (PR #18), the staff profile (PR #20) and the leave module (PR #22).

## Goal

A บุคลากร asks permission in the system to travel on official duty: a meeting, training, a study visit or a field visit. The request goes up the **สายบังคับบัญชา** to ผู้อำนวยการ. The approved trip shows on the unit calendar next to leave, so heads can see who is away.

## Proposed decisions (to confirm with wasan)

1. **Module.** ไปราชการ is its own โมดูล, `official-travel`, labelled "ไปราชการ", in the งานของฉัน group. Its sections are:
   - ไปราชการของฉัน
   - ขออนุมัติไปราชการ
   - อนุมัติไปราชการ (with a count)
   - ทั้งหมด (HR only)
2. **The request (คำขอไปราชการ)** records:
   - Subject.
   - Organiser.
   - Place and province.
   - Start and end dates, with เช้า/บ่าย half days as in leave.
   - Travel type: ในจังหวัด / ต่างจังหวัด / ต่างประเทศ.
   - Vehicle: รถราชการ / รถส่วนตัว / รถโดยสารสาธารณะ / เครื่องบิน / ไปกับผู้จัด.
   - Estimated cost by item (เบี้ยเลี้ยง ที่พัก พาหนะ ค่าลงทะเบียน), and where the money comes from: เงินบำรุง / งบผู้จัด / ไม่เบิก.
   - One PDF attachment, such as the invitation letter (หนังสือเชิญ).
3. **Travelling together.** One request can list several บุคลากร. The person who files it is the หัวหน้าคณะ. Each person on the list is approved through their own สายบังคับบัญชา. The trip is approved when every person is approved, and anyone rejected comes off the list.
4. **Approval** goes up to ผู้อำนวยการ (`HOSPITAL`) by default. HR can change the final level per travel type, like leave.
5. **Dates.** A trip cannot overlap the same person's ใบลา or another of their trips. Trip days do not count against leave balances.
6. **Visibility.** Unit heads see trips on the leave calendar, as "ไปราชการ" plus the place. Costs and the attachment are seen only by the travellers, their approvers and HR.
7. **Notifications** use the same bell, for example `[ไปราชการ] > [อนุมัติ > ผู้อำนวยการโรงพยาบาล]`.
8. **Not in round 1:**
   - The report after the trip.
   - Claiming expenses back.
   - Booking a รถราชการ in the fleet module, which is not built yet.
   - Printing the official form.
