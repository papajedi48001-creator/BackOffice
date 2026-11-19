# ลูกหนี้ทันตกรรม: สิทธิ 25 สีแดง, สิทธิ 23 นับเฉพาะ icode 3015628

Status: asked by the user in the project thread on 2026-11-19 ("กราฟ pttype = 25 เป็นสีแดง", "กราฟ pttype = 23 ดึง icode = 3015628 เท่านั้น", "เสร็จแล้ว merge ได้").

## Behaviour
- **สิทธิ 25 (PP Workload)** is a red bar in "มูลค่าลูกหนี้แยกตามสิทธิการรักษา", with the label "PP Workload", like a สิทธิ in ผัง UC ใน CUP. The legend reads
  "แท่งสีแดง = สิทธิในผัง UC ใน CUP และ 25 PP Workload". Grouped by ผังบัญชี nothing changes, and neither does คาดการณ์รายรับ.
- **สิทธิ 23 (OP ส่งเสริมและป้องกันโรค)** counts only `opitemrece` icode `3015628`: a visit's ค่ารักษารวม and ลูกหนี้ = the `sum_price` of that icode, ชำระแล้ว 0.
  A สิทธิ 23 visit without that icode is left out. The rule is applied when the rows are read, so the cards, both charts, the tables, the detail and the CSV agree.

## Approaches
1. Apply the rules in the reader and the summary (chosen): one place for every view, so the numbers on the page stay consistent.
2. Change only the bar: the cards and the table would show other numbers than the chart. Rejected.

## Code
- `dental-rules.ts`: `RED_PTTYPES = ['25']`, `DENTAL_PTTYPE_ICODES = { '23': ['3015628'] }` and `applyPttypeItems(row, itemAmount)`.
- `dental-reader.ts`: the SELECT adds `item_amount` (the `sum_price` of those icodes for those สิทธิ). `opitemrece` is already granted.
- `dental-summary.ts`: red when grouped by สิทธิ = ผัง UC ใน CUP or a `RED_PTTYPES` สิทธิ.
