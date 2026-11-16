# เลือกบทบาทได้เมื่อมีบทบาทระดับเดียว — design

Report: "ยังเลือกบทบาทไม่ได้หลัง login provider". After a Provider ID sign-in the person went straight to หน้าหลัก, saw no
picker and no "เปลี่ยนบทบาท" in the profile menu. Superpowers skills were invoked (systematic-debugging, TDD).

## Root cause

`resolveActiveRole` auto-selected the tier of a person who holds exactly one tier (only ผู้จัดการ or only ผู้ดูแลระบบ),
`/choose-role` redirected anyone with fewer than two tiers to หน้าหลัก, and the shell offered "เปลี่ยนบทบาท" only for two
tiers. Such a person could never choose บุคลากรทั่วไป. Not specific to Provider ID: a password sign-in behaves the same.

## Behaviour (decided with the user: show the picker every sign-in)

- 0 tiers: unchanged, บุคลากรทั่วไป, no picker.
- 1 or 2 tiers: a new session holds no role until the person picks at `/choose-role` (the held tier(s) + บุคลากรทั่วไป).
  A stored tier still held, or `employee`, stays in effect; a stale stored value sends the person back to the picker.
- The profile menu shows "เปลี่ยนบทบาท" to everyone who holds at least one tier.
- Server-side checks are unchanged: `canChooseRole` already accepted the held tier or `employee`.
