# Hospital head shown as ผู้อำนวยการ — design

Status: approved by wasan (2026-10-26: "ให้หัวหน้าระดับโรงพยาบาลแสดงชื่อว่า \"ผู้อำนวยการ\"").

## Goal

The head of a unit whose type is โรงพยาบาล (`HOSPITAL`) is the director, so every HR screen names that role ผู้อำนวยการ instead of หัวหน้า.

## Behaviour

- `/hr/organizations`: a hospital unit reads `ผู้อำนวยการ <name>`, `ยังไม่มีผู้อำนวยการ`, `ผู้อำนวยการพ้นสภาพ`.
- `/hr/organizations/[id]` for a hospital unit: the summary label, the history heading and column, the empty-history text, and the assign form (`ผู้อำนวยการคนใหม่`, `วันที่เริ่มเป็นผู้อำนวยการ`, `ตั้งเป็นผู้อำนวยการ`) use ผู้อำนวยการ.
- The form follows the saved unit type; changing the type in the select changes the labels after saving.
- Units of other types, or with no type, keep หัวหน้า.
- Display only: data, permissions, the command chain and the API are unchanged. CONTEXT.md notes the term.
