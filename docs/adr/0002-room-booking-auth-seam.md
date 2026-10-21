# 0002 โมดูลห้องประชุมรู้จักผู้ใช้ผ่าน requireActor เท่านั้น ระหว่างรอ SSO

**Status:** accepted
**Date:** 2026-10-21

## Context

ผู้ใช้ต้องเข้าระบบด้วย SSO ผ่านหน้าหลัก Back Office แต่ SSO ยังไม่พร้อม ปัจจุบันมี **บัญชีท้องถิ่น** กับ session ฝั่ง server และบทบาทที่โหลดจากฐานข้อมูล (R0.5)

## Decision

route และหน้าของโมดูลห้องประชุมเรียก `requireActor(request)` ใน `apps/web/src/lib/actor.ts` เพียงจุดเดียว ซึ่งคืน `{ personId, roles }` จาก session ปัจจุบัน service ใน `packages/core/src/rooms` รับ actor เป็นข้อมูล ไม่อ่าน cookie หรือรู้วิธีเข้าระบบ

## Consequences

- เมื่อ SSO พร้อม การเข้าระบบด้วย **ตัวตนภายนอก** สร้าง session แบบเดียวกัน โมดูลห้องประชุมไม่ต้องแก้
- ระหว่างนี้ผู้ใช้ทดลองด้วยบัญชีท้องถิ่น
- ทดสอบ service ได้โดยส่ง actor ปลอม ไม่ต้องมี session
