---
version: alpha
colors:
  ink: "#12261D"
  public-health-green: "#0E7C47"
  green-deep: "#0B3B2A"
  paper: "#F3F7F4"
  line: "#DBE5DF"
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

สีหลักขององค์กรคือเขียวสาธารณสุข `#0E7C47` ใช้กับหน้าเข้าสู่ระบบ หน้าหลัก และแถบเมนูด้านซ้าย (เขียวเข้ม `#0B3B2A`) ส่วนพื้นที่ทำงานของแต่ละโมดูลใช้ "สีประจำโมดูล" ผ่าน CSS variable `--accent` ซึ่ง `[data-module="<code>"]` ใน `apps/web/src/app/styles.css` เป็นผู้กำหนด ห้ามฝังค่าสี hex ใหม่ในสไตล์ของหน้า ให้ใช้ token (`--accent`, `--accent-strong`, `--accent-soft`, `--accent-tint`, `--ink`, `--muted`, `--line`, `--surface`, `--page`)

| โมดูล | code | สี |
|---|---|---|
| หน้าหลัก | home | `#0E7C47` |
| คำขอ | requests | `#1D4ED8` |
| การแจ้งเตือน | notifications | `#6D28D9` |
| การลา | leave | `#BE185D` |
| งานบุคคล | hr | `#0F766E` |
| จองห้องประชุม | room-booking | `#0369A1` |
| คลังพัสดุ | inventory | `#B45309` |
| สิทธิ์และการตรวจสอบ | access | `#475569` |

สีประจำโมดูลทุกสีต้องผ่าน 4.5:1 กับตัวอักษรขาว สีสถานะ (รอ/อนุมัติ/ไม่อนุมัติ) และสี alert ใช้ความหมายเดิมทุกโมดูล ไม่ใช้สีโมดูลแทนสถานะ gradient ใช้ได้เฉพาะแถบเมนูซ้าย หัวหน้าหลัก และพื้นหลังหน้าเข้าสู่ระบบ

## Typography

ใช้ฟอนต์ Thai-capable system stack ขนาดข้อความปกติอย่างน้อย 16px และ line-height โปร่งพอสำหรับชื่อหน่วยงานและรายการงานยาว หัวเรื่องมีน้ำหนักชัดแต่ไม่ใช้ serif หรือรูปแบบทางการเกินไป

## Layout

signature ของระบบคือ “สถานะงานเป็นรางข้อมูล” — เส้นสีด้านซ้ายของพื้นที่งานทำให้เห็นว่าเป็นพื้นที่ดำเนินการ ไม่ใช่หน้า marketing ส่วนอื่นใช้กริดเรียบและข้อมูลมี hierarchy ตามหน้าที่จริง

## Elevation & Depth

พื้นผิว static แยกด้วยเส้น line เป็นหลัก ใช้เงาเบามากเฉพาะ overlay หรือเมนูที่ซ้อนเหนือเนื้อหา ไม่ใช้ card จำนวนมากเพื่อจัดหน้าจอ

ข้อยกเว้น: หน้าหลัก (`/dashboard`) เป็นตารางปุ่มโมดูล ใช้ขอบเส้น line มุม 12px ไอคอนเส้นในกรอบสีอ่อนตามกลุ่ม เงาเบาเฉพาะตอน hover และไม่มี gradient โมดูลที่ยังไม่เปิดใช้แสดงขอบประพร้อมป้าย "เร็ว ๆ นี้" และไม่เป็นลิงก์ หน้าทำงานอื่นยังใช้กติกาเดิม

## Shapes

ใช้มุม 8px สำหรับ control และ 12px สำหรับ panel; ไม่มี pill สำหรับปุ่มทั่วไป และ action อันตรายแยกจาก action หลักด้วย intent ไม่ใช่ตำแหน่งเพียงอย่างเดียว

## Components

ปุ่มและลิงก์ใช้ native semantics, มี focus ring ที่มองเห็นได้ และข้อความ action ใช้คำกริยาไทยตรงไปตรงมา สถานะต้องมีข้อความประกอบ ไม่สื่อสารด้วยสีเพียงอย่างเดียว

## Do's and Don'ts

- ใช้คำที่บุคลากรโรงพยาบาลรู้จัก เช่น “คำขอ”, “รอพิจารณา”, “บันทึกการตรวจสอบ”
- เก็บความหนาแน่นแบบ operational แต่เว้นพื้นที่ให้ข้อความไทยยาวได้
- ห้ามแสดงเลขบัตรประชาชนเต็มใน UI
- ห้ามใช้ browser alert/confirm/prompt หรือ clickable div
- การยืนยันและการกรอกเหตุผลทุกจุดใช้ popup `ActionDialog` (`components/action-dialog.tsx`): native `<dialog>` แบบ modal, Esc ปิดได้, พื้นหลังจางและเบลอเล็กน้อย, เปิดด้วยการลอยขึ้นสั้น ๆ และไม่เคลื่อนไหวเมื่อผู้ใช้ตั้งลดการเคลื่อนไหว ฟอร์มยาวยังเป็นหน้าเต็ม
