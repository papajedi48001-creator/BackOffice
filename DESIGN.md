---
version: alpha
colors:
  ink: "#102A43"
  hospital-blue: "#0B7285"
  care-teal: "#0F9D8A"
  paper: "#F7FAFC"
  line: "#D9E2EC"
  alert: "#C2410C"
typography:
  display:
    fontFamily: "'Noto Sans Thai', 'Leelawadee UI', system-ui, sans-serif"
  body:
    fontFamily: "'Noto Sans Thai', 'Leelawadee UI', system-ui, sans-serif"
  utility:
    fontFamily: "ui-monospace, 'Cascadia Mono', monospace"
rounded:
  control: "8px"
  panel: "12px"
spacing:
  unit: "8px"
components:
  statusRail:
    color: "hospital-blue"
  actionButton:
    radius: "control"
---

## Overview

Back Office โรงพยาบาลวาริชภูมิเป็น product UI สำหรับบุคลากรภายในที่ใช้ในช่วงเวลางานจริง จึงต้องอ่านง่าย เชื่อถือได้ และไม่ทำให้ข้อมูลสำคัญกลืนไปกับความตกแต่ง ภาษาหลักคือไทย โดยรองรับข้อความอังกฤษด้านเทคนิคแบบไม่ทำให้บรรทัดกระโดด

## Colors

ใช้ hospital-blue สำหรับการนำทางและสถานะงานปกติ, care-teal สำหรับการยืนยันที่ปลอดภัย, alert สำหรับข้อควรดำเนินการ และ paper เป็นพื้นที่พักสายตา หลีกเลี่ยง gradient, สีเรือง และพื้นดำหนัก เพราะขัดกับบริบทงานโรงพยาบาล

## Typography

ใช้ฟอนต์ Thai-capable system stack ขนาดข้อความปกติอย่างน้อย 16px และ line-height โปร่งพอสำหรับชื่อหน่วยงานและรายการงานยาว หัวเรื่องมีน้ำหนักชัดแต่ไม่ใช้ serif หรือรูปแบบทางการเกินไป

## Layout

signature ของระบบคือ “สถานะงานเป็นรางข้อมูล” — เส้นสีด้านซ้ายของพื้นที่งานทำให้เห็นว่าเป็นพื้นที่ดำเนินการ ไม่ใช่หน้า marketing ส่วนอื่นใช้กริดเรียบและข้อมูลมี hierarchy ตามหน้าที่จริง

## Elevation & Depth

พื้นผิว static แยกด้วยเส้น line เป็นหลัก ใช้เงาเบามากเฉพาะ overlay หรือเมนูที่ซ้อนเหนือเนื้อหา ไม่ใช้ card จำนวนมากเพื่อจัดหน้าจอ

## Shapes

ใช้มุม 8px สำหรับ control และ 12px สำหรับ panel; ไม่มี pill สำหรับปุ่มทั่วไป และ action อันตรายแยกจาก action หลักด้วย intent ไม่ใช่ตำแหน่งเพียงอย่างเดียว

## Components

ปุ่มและลิงก์ใช้ native semantics, มี focus ring ที่มองเห็นได้ และข้อความ action ใช้คำกริยาไทยตรงไปตรงมา สถานะต้องมีข้อความประกอบ ไม่สื่อสารด้วยสีเพียงอย่างเดียว

## Do's and Don'ts

- ใช้คำที่บุคลากรโรงพยาบาลรู้จัก เช่น “คำขอ”, “รอพิจารณา”, “บันทึกการตรวจสอบ”
- เก็บความหนาแน่นแบบ operational แต่เว้นพื้นที่ให้ข้อความไทยยาวได้
- ห้ามแสดงเลขบัตรประชาชนเต็มใน UI
- ห้ามใช้ browser alert/confirm/prompt หรือ clickable div
