# ตรึงหัวตารางทุกตาราง (sticky table headers) — design

วันที่ 24 พ.ย. 2569 · ขอโดย wasan ("ทำเลย" — ไม่ต้องถามต่อ, ไล่แก้ทั้งระบบ)

## Intent
เมื่อเลื่อนตาราง ไม่ว่าจะเลื่อนทั้งหน้าหรือเลื่อนในกล่องตาราง ส่วนหัวตารางต้องติดอยู่ด้านบนเสมอ
ทุกตารางที่มีอยู่และที่จะสร้างใหม่ ตัวอย่างที่ผู้ใช้ชี้: ตารางรายครั้ง Instrument OFC (13 คอลัมน์ เลื่อนแนวนอนได้)

## Goals / non-goals
- ทุก `<table>` ที่มี `<thead>` ได้หัวตรึงโดยอัตโนมัติ ไม่ต้องใส่ class หรือห่อ component ใหม่
- หัวตรึงใต้แถบบน (`.app-topbar`) และแถบเมนูย่อยโมดูล (`.module-subnav`) และแถบช่วงวันที่ IMC (`.imc-range`) ที่ติดอยู่แล้ว ไม่ถูกบัง
- ตารางในกล่องเลื่อนแนวนอน (`overflow-x: auto`) ยังเลื่อนซ้ายขวาได้ และหัวยังตรึงเมื่อเลื่อนหน้า
- ตารางในกล่องที่มีความสูงจำกัด (`.money-table-wrap.is-tall`) ตรึงเมื่อเลื่อนในกล่อง และเมื่อเลื่อนหน้า
- ตารางใน popup (`dialog`) ตรึงภายในกล่องเลื่อนของ popup เท่านั้น
- Non-goal: ตรึงคอลัมน์ซ้าย (มีอยู่แล้วบางตาราง คงไว้), พิมพ์ (หัวไม่ตรึงตอนพิมพ์)
- Anti-goal: ไม่บังคับให้ทุกตารางมีความสูงจำกัด/scrollbar ซ้อน, ไม่ทำให้หัวลอยหลุดจากตาราง

## Constraints (เหตุผลที่ CSS อย่างเดียวไม่พอ)
`position: sticky` ยึดกับ scroll container ที่ใกล้ที่สุด กล่อง `overflow-x: auto` (และ `table { overflow: hidden }` เดิม)
เป็น scroll container จึงทำให้หัวไม่ติดเมื่อเลื่อนหน้า

## Approaches
1. **CSS sticky บน `thead` + สคริปต์กลางชดเชยการเลื่อนหน้า (เลือก)**: `thead { position: sticky }` ทำงานเองเมื่อเลื่อนหน้า (ตารางไม่อยู่ในกล่อง) และเมื่อเลื่อนในกล่อง; สำหรับตารางที่อยู่ในกล่อง สคริปต์ `StickyTableHeaders` (mount ครั้งเดียวใน root layout) คำนวณ `translateY` ให้หัวลงมาอยู่ใต้แถบบนเมื่อเลื่อนหน้า ได้ทุกตารางอัตโนมัติ
2. ให้ทุกกล่องตารางมี `max-height` ไม่เกินจอและเลื่อนในกล่อง: CSS ล้วน แต่เกิด scrollbar ซ้อนทุกตาราง และเมื่อเลื่อนหน้าผ่านกล่อง หัวก็ยังหลุด — ไม่ตรงกฎ
3. Clone หัวตารางเป็นแถบลอย (fixed) แยก: ต้องซิงก์ความกว้างคอลัมน์/การเลื่อนแนวนอน ซับซ้อนและเสี่ยงคอลัมน์เพี้ยน

## Design
- `styles.css`: `table { overflow: clip }` (คงมุมโค้ง ไม่สร้าง scroll container), `thead { position: sticky; top: 0; z-index: 3; transform: translateY(var(--thead-shift, 0px)) }`,
  `table[data-sticky-head="page"] > thead { top: var(--table-sticky-top) }`, `@media print { thead { position: static; transform: none } }`
  ลบ sticky/top ซ้ำซ้อนใน `.money-table-wrap thead th`
- `lib/sticky-table-head.ts` (ฟังก์ชันบริสุทธิ์): `stickyChromeBottom`, `findScrollContainer`, `headShift`
- `components/sticky-table-headers.tsx` (client): ทุกเฟรมที่มีการเลื่อน (scroll capture, resize, MutationObserver):
  ตั้ง `--table-sticky-top` บน `<html>`; ตารางที่ไม่อยู่ในกล่อง → `data-sticky-head="page"`; อยู่ในกล่อง → `data-sticky-head="box"` + `--thead-shift`
  ใน `dialog` ไม่ชดเชยการเลื่อนหน้า
- DESIGN.md: บันทึกกฎตาราง
- เทสต์: ฟังก์ชันบริสุทธิ์ (jsdom), เทสต์ CSS (`styles-tables.test.ts`), เทสต์ root layout mount component, ภาพหน้าจอจริงจาก Playwright

## Left to the builder
ค่า z-index, การ throttle ด้วย requestAnimationFrame
