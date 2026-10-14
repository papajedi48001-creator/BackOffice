# R0.5 Server-Side Session and Access Loading Design

**Status:** approved for implementation (R0.5 hardening, item 3–4)
**Date:** 2026-10-14
**Source:** code review findings P0-1 (RBAC not wired), P0-3 (session never expires), P1-3 (login hardening)

## Purpose

ให้การเข้าสู่ระบบด้วยบัญชีท้องถิ่นมีอายุจำกัด ยกเลิกได้จริง และให้สิทธิ์ของผู้ใช้มาจากข้อมูลในฐานข้อมูลทุกครั้ง เพื่อให้การมอบหรือถอน **บทบาท** มีผลทันทีโดยไม่ต้องรอให้ผู้ใช้ login ใหม่

## Current behaviour

- cookie `backoffice_session` เป็น payload ที่เซ็นด้วย HMAC ไม่มีเวลาหมดอายุ ไม่มี `maxAge` และ logout แค่ลบ cookie ฝั่ง browser
- `LocalAuthService` คืน `roles: []` และ `dataOwnerModules: []` เสมอ จึงไม่มีใครได้สิทธิ์ `hr.*` หรือ `data.export`
- login ไม่จำกัดจำนวนครั้ง, ตอบเร็วกว่าเมื่อไม่มี username และไม่บันทึกการตรวจสอบ

## Decisions

| เรื่อง | ทางเลือกที่ใช้ | เหตุผล |
|---|---|---|
| ที่เก็บ session | ตาราง `user_session` ใน MariaDB | ยกเลิกได้, อยู่ใน backup เดียวกับข้อมูลอื่น, Redis ยังไม่ได้ต่อใช้งาน |
| token | สุ่ม 32 ไบต์ (base64url) ใน cookie, เก็บเฉพาะ SHA-256 ใน DB | ข้อมูล DB รั่วไม่ทำให้สวมรอยได้ |
| อายุ session | idle 30 นาที, สูงสุด 12 ชั่วโมงนับจาก login | ครอบคลุมหนึ่งเวรงาน, เครื่องที่ทิ้งไว้หมดอายุเร็ว |
| สิทธิ์ | โหลด `role_assignment` + `data_owner_assignment` ทุก request จาก DB | ถอนสิทธิ์มีผลทันที |
| การจับคู่ role → permission | คงไว้ในโค้ด (`packages/core/src/access/policy.ts`) และทำ `role.name` ให้ unique | permission ถูกตรวจในโค้ดอยู่แล้ว ตาราง `role_permission` จะเพิ่มเมื่อมีหน้าจัดการบทบาท |
| จำกัดการเดารหัสผ่าน | ล็อก username 15 นาทีหลังผิด 5 ครั้งภายใน 15 นาที (ตาราง `login_throttle` keyed ด้วย SHA-256 ของ username ตัวพิมพ์เล็ก) | ไม่พึ่ง IP ซึ่งผ่าน proxy และเชื่อถือไม่ได้; ระยะล็อกสั้นจำกัดผลของการถูกล็อกโดยคนอื่น |
| timing | ถ้าไม่พบ username ยังคำนวณ scrypt กับ hash หลอก | ไม่ให้เดา username จากเวลา |
| บันทึกการตรวจสอบ | `identity.local_login` ผล `SUCCESS` (actor = บุคลากร) หรือ `FAILURE` (actor = null) เมื่อพบบัญชี; `identity.local_logout` เมื่อออกจากระบบ | ไม่บันทึก username ที่ไม่มีอยู่ เพราะไม่มี target และอาจเป็นรหัสผ่านที่พิมพ์ผิดช่อง |

session ที่เป็น cookie แบบเดิมจะใช้ไม่ได้หลัง deploy ผู้ใช้ต้อง login ใหม่หนึ่งครั้ง

## Components and interfaces

- `packages/db/migrations/0003_session_and_login_throttle.sql`: ตาราง `user_session`, `login_throttle`, unique key `role_name_unique`
- `packages/core/src/identity/session-service.ts`
  - `SessionService.start(personId): Promise<{ token, expiresAt }>`
  - `SessionService.resolve(token): Promise<Session | null>` ตรวจ revoked/idle/absolute, ต่ออายุ idle (เขียน `last_seen_at` ไม่เกินนาทีละครั้ง) แล้วโหลดสิทธิ์ผ่าน `AccessSubjectLoader`
  - `SessionService.revoke(token): Promise<string | null>` คืน personId ของ session ที่ยกเลิก
- `packages/core/src/identity/auth-service.ts`: `LocalAuthService` รับ `LoginThrottle` และ audit recorder, คืน `{ personId }` ของผู้ที่ยืนยันตัวตนสำเร็จ; error `LOGIN_LOCKED` เมื่อถูกล็อก
- `apps/web/src/lib/session.ts`: `readSession(request)` เป็น async อ่าน cookie แล้วเรียก `SessionService.resolve`; `startSession(personId)`, `endSession(request)`; ใช้ connection pool เดียวต่อ process (`apps/web/src/lib/database.ts`)
- `api/auth/local`: ตอบ `429 login_locked` เมื่อถูกล็อก, `401 invalid_credentials` เมื่อผิด; cookie มี `maxAge` 12 ชั่วโมง
- `api/auth/local/sign-out`: revoke session ใน DB, บันทึก audit, แล้วลบ cookie

## Out of scope

- OIDC/SSO (รอ issuer และ claims จริง)
- หน้าจัดการบทบาทและตาราง `role_permission`
- การล้าง `user_session` ที่หมดอายุแล้ว (เพิ่มเป็นงาน worker ภายหลัง; แถวที่หมดอายุไม่มีผลต่อความปลอดภัย)

## Verification

- unit: session หมดอายุตาม idle/absolute, revoked ใช้ไม่ได้, token ใน DB เป็น hash, สิทธิ์มาจาก loader ทุกครั้ง
- unit: ล็อกหลังผิดครบ, login สำเร็จล้างตัวนับ, ไม่พบ username ยังรัน scrypt, audit สำเร็จ/ล้มเหลว
- integration (MariaDB): migration 0003, start → resolve → revoke, การโหลด role ตามหน่วยงาน, throttle
- web: route login ตั้ง cookie ที่มี Max-Age, sign-out revoke, หน้าที่ป้องกันยังทำงานเมื่อ `readSession` เป็น async
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration`
