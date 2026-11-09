# เข้าสู่ระบบ BackOffice ด้วย Provider ID ผ่าน portal Radius — Design

วันที่: 2026-11-09 · สถานะ: รอผู้ใช้ตรวจ

## เป้าหมาย

บุคลากรกดปุ่ม "เข้าสู่ระบบด้วย Provider ID" ที่หน้า login ของ BackOffice แล้วยืนยันตัวตนผ่าน portal ของ repo `papajedi48001-creator/radius-server` (Ubuntu `radius-server` 192.168.1.10, `https://aut-waritch-hosp.moph.go.th`) ซึ่ง login Health ID → Provider ID ได้อยู่แล้ว จากนั้นกลับมาเข้า BackOffice ได้ทันที

สิ่งที่ผู้ใช้ตัดสินแล้ว (2026-11-09):

1. portal Radius เป็นตัวกลาง SSO (BackOffice ไม่ต่อ Provider ID เอง ไม่ขอ Client ID/callback ใหม่จาก MOPH)
2. จับคู่บัญชีได้ทั้งสองทาง: ผู้ใช้ผูกเองด้วย username/รหัสผ่าน BackOffice ครั้งแรก และ admin ผูก/ยกเลิกการผูกให้
3. ถ้ามี session ของ portal ค้างอยู่ ให้ใช้ต่อได้ ไม่บังคับยืนยัน Provider ID ใหม่ทุกครั้ง

## นอกขอบเขต

- จับคู่อัตโนมัติด้วยเลขบัตร/`hash_cid` (ยังไม่ทราบวิธีสร้าง `hash_cid`; portal อ่าน `hash_cid` ไม่ได้ตาม ADR 0004 ของ radius-server)
- Google fallback login ของ portal: ผู้ที่เข้า portal ด้วย Google ก็ได้ `sub` เดียวกัน เพราะ `sub` คือรหัสสมาชิกของ portal ไม่ใช่บัญชีภายนอก จึงใช้ได้โดยไม่ต้องทำอะไรเพิ่ม
- การสร้างบุคลากรหรือให้สิทธิ์ใน BackOffice จาก portal: สิทธิ์ทั้งหมดยังมาจาก BackOffice
- Single logout ระหว่างสองระบบ
- ยกเลิก login ด้วยรหัสผ่าน: ยังคงใช้ได้ตลอด

## สถาปัตยกรรม

OpenID Connect แบบ authorization code + PKCE (S256) โดย portal เป็น OpenID Provider และ BackOffice เป็น confidential client เพียงตัวเดียว

```
Browser ──1──> BackOffice /api/auth/provider/start
        <─302─ portal /oidc/authorize?client_id&redirect_uri&state&nonce&code_challenge
Browser ──2──> portal (มี session portal แล้ว → ข้าม; ไม่มี → flow Provider ID เดิม แล้วกลับมาที่ /oidc/authorize)
        <─302─ BackOffice /api/auth/provider/callback?code&state
BackOffice ──3──> portal /oidc/token (client_secret_basic + code_verifier)  → id_token (ES256)
BackOffice ──4──> portal /oidc/jwks (cache) → ตรวจลายเซ็น, iss, aud, exp, nonce
BackOffice ──5──> หา person_external_identity(issuer, sub) → session / หน้าผูกบัญชี
```

### ฝั่ง portal (repo radius-server)

- `GET /.well-known/openid-configuration`, `GET /oidc/authorize`, `POST /oidc/token`, `GET /oidc/jwks`
- client เดียวจากไฟล์ protected ใต้ `/etc/hospital-backoffice-sso/` (client ID, hash ของ secret, redirect URI ตรงตัวหนึ่งค่า; ไม่มี wildcard) และกุญแจลงนาม EC P-256 เก็บนอก Git เช่นเดียวกับรูปแบบ `hospital-provider-config`; ไม่มีไฟล์ → endpoint ตอบ 503 และ discovery ไม่เปิด
- `/oidc/authorize`: ตรวจ `client_id`, `redirect_uri` ตรงตัว, `response_type=code`, `code_challenge_method=S256`, `state`, `nonce`
  - ไม่มี session portal → เก็บคำขอไว้ฝั่ง server (ตาราง `oidc_authorization_request`, อายุ 10 นาที, ผูกกับ cookie browser แบบเดียวกับ `LoginTransaction`) แล้วส่งไป `/auth/login`; หลัง callback Provider ID สำเร็จ ให้กลับมาทำคำขอนั้นต่อแทน `/dashboard`
  - มี session portal ที่ยังไม่หมดอายุ → ใช้ต่อได้ทันที (ตามการตัดสินข้อ 3)
  - สมาชิกต้องมีสถานะ `approved` เท่านั้น; สถานะอื่นแสดงหน้า error ของ portal และไม่ส่ง code กลับ
- code: สุ่ม 32 ไบต์, เก็บเฉพาะ SHA-256, ใช้ได้ครั้งเดียว, อายุ 60 วินาที, ผูกกับ client, redirect URI, nonce และ code_challenge (ตาราง `oidc_authorization_code`)
- `/oidc/token`: ตรวจ client secret แบบ constant-time, ตรวจ code_verifier, ใช้ code แล้วลบทันที (ใช้ซ้ำ → `invalid_grant`), ตรวจสถานะ `approved` อีกครั้งตอนแลก
- ID token (ES256, `kid`): `iss`, `aud`=client ID, `sub`=`members.id`, `iat`, `exp` (+5 นาที), `nonce`, `auth_time`, `name` (ชื่อ-สกุลไทย), `preferred_username` (`network_name` ถ้ามี) ไม่มีเลขบัตร, `hash_cid`, อีเมล หรือ access token ของ MOPH; ไม่ออก access token/refresh token ให้ BackOffice
- migration Alembic เพิ่มสองตารางข้างต้น (additive)
- log บันทึกเฉพาะผลและประเภทข้อผิดพลาด ไม่บันทึก code, state, verifier, secret หรือ token

### ฝั่ง BackOffice

**ตั้งค่า** (env ของ `apps/web`): `PROVIDER_SSO_ISSUER`, `PROVIDER_SSO_CLIENT_ID`, `PROVIDER_SSO_CLIENT_SECRET_FILE`, `PROVIDER_SSO_REDIRECT_URI` ไม่ครบ → ปุ่มไม่แสดง และ route ตอบ 404 ตรวจผ่าน `runtime-env`

**ข้อมูล** (migration additive ใน `packages/db/src/migrate.ts` + Drizzle schema):

- `person_external_identity`: `id`, `person_id`, `issuer`, `subject`, `display_name`, `linked_by_person_id` (null = ผู้ใช้ผูกเอง), `linked_at`; unique (`issuer`,`subject`) และ unique (`person_id`,`issuer`)
- `external_login_pending`: `id`, `issuer`, `subject`, `display_name`, `token_hash` (null หลังหมดอายุ), `expires_at`, `last_seen_at`; unique (`issuer`,`subject`) ใช้ทั้งเป็นตั๋วผูกเอง 10 นาที และรายการ "รอผูกบัญชี" ของ admin

**core** (`packages/core/src/identity`):

- `OidcClient` (ใช้ `OidcIdentityProvider` interface ที่มีอยู่): สร้าง URL authorize, แลก code, ตรวจ ID token ด้วย `jose` (JWKS cache 10 นาที, clock skew 60 วินาที)
- `ExternalLoginService`:
  - `resolve(identity)` → `{ kind: 'linked', personId }` หรือ `{ kind: 'unlinked', ticket }` (บันทึก/ปรับ `external_login_pending`)
  - `linkWithPassword(ticket, credentials)` → ใช้ `LocalAuthService` และ throttle เดิม; บุคลากรที่ผูก issuer นี้อยู่แล้ว → `ALREADY_LINKED`; สำเร็จ → insert link, ลบ pending, audit ใน transaction เดียว
  - `adminLink(actor, pendingId, personId)` / `adminUnlink(actor, personId, reason)` — unlink เพิกถอน session ทั้งหมดของบุคคลนั้นใน transaction เดียวกัน
- บุคลากรที่ `employment_status` ไม่ใช่ `ACTIVE` เข้าไม่ได้เช่นเดียวกับ login รหัสผ่าน

**route** (`apps/web/src/app/api/auth/provider/`):

- `start` (GET): สร้าง state, nonce, PKCE verifier เก็บใน cookie httpOnly เข้ารหัส อายุ 10 นาที path `/api/auth/provider` แล้ว 302 ไป portal
- `callback` (GET): ตรวจ state กับ cookie, แลก code, ตรวจ token, `resolve` → linked: `startSession` แล้วไป `/` (หรือหน้าเปลี่ยนรหัสผ่าน/เลือกบทบาทตาม flow เดิม); unlinked: cookie ตั๋ว (httpOnly) แล้วไป `/link-provider`
- `link` (POST): รับ username/password + ตั๋วจาก cookie → `linkWithPassword`

**หน้าจอ** (ทำตาม `DESIGN.md`, คำศัพท์ตาม `CONTEXT.md`):

- หน้า login: ปุ่มรอง "เข้าสู่ระบบด้วย Provider ID" ใต้ฟอร์มเดิม และข้อความ error จาก query code ที่กำหนดไว้ เช่น `?provider=unavailable` → "ระบบ Provider ID ไม่พร้อมใช้งาน กรุณาใช้ชื่อผู้ใช้และรหัสผ่าน" (ไม่มีข้อมูลลับใน URL)
- `/link-provider`: แสดงชื่อจาก Provider ID, ฟอร์ม username/รหัสผ่าน, และข้อความ "ถ้าไม่มีรหัสผ่าน BackOffice ให้ติดต่อผู้ดูแลระบบเพื่อผูกบัญชี"
- `/admin/provider-links` (ผู้ดูแลระบบเท่านั้น ผ่าน guard admin เดิม): ตาราง "รอผูกบัญชี" (ชื่อจาก Provider ID, เห็นล่าสุด) ปุ่ม "ผูกกับบุคลากร" เปิด `FormDialog` ที่ใช้ `person-picker` เดิม; ตาราง "ผูกแล้ว" ปุ่ม "ยกเลิกการผูก" เปิด `ActionDialog` ที่ต้องใส่เหตุผล ทุก popup ปิดได้จากปุ่มเท่านั้น

**สิทธิ์:** การผูก/ยกเลิกโดย admin เป็นงานระดับระบบ ใช้ guard ผู้ดูแลระบบเดิม (`admin-route.ts`) ไม่เพิ่ม permission รายโมดูล จึงไม่ต้องแก้ `permissionModules` และไม่ให้ผู้จัดการโมดูลทำได้

**Audit** (ไม่มี token, code, รหัสผ่าน หรือเหตุผลใน metadata นอกเหนือที่กฎอนุญาต; เหตุผลยกเลิกเก็บในคอลัมน์ของ audit ตามรูปแบบเดิม ไม่ใส่ใน metadata):

- `identity.provider_login` SUCCESS/FAILURE (FAILURE ระบุ `stage`: `state` | `exchange` | `token` | `inactive`)
- `identity.provider_link` (`method: 'self' | 'admin'`)
- `identity.provider_unlink`

## กรณีผิดพลาด

| เหตุการณ์ | ผล |
|---|---|
| ยังไม่ตั้งค่า SSO | ไม่แสดงปุ่ม, route 404 |
| portal ติดต่อไม่ได้/timeout 10 วินาที/ตอบผิดรูปแบบ | กลับหน้า login `?provider=unavailable` |
| state ไม่ตรง, cookie หมดอายุ, ลายเซ็น/nonce/aud ผิด, code ใช้ซ้ำ | กลับหน้า login `?provider=failed`, audit FAILURE |
| สมาชิก portal ไม่ใช่ `approved` | portal แสดงหน้า error ของตัวเอง ไม่กลับมา BackOffice |
| บุคลากรไม่ ACTIVE | `?provider=inactive` |
| ตั๋วผูกบัญชีหมดอายุ | กลับหน้า login ให้เริ่มใหม่ (รายการรอผูกของ admin ยังอยู่) |
| รหัสผ่านผิด/ถูกล็อก | ข้อความเดียวกับ login รหัสผ่าน |

Logout จาก BackOffice จบเฉพาะ session BackOffice ไม่เรียก logout portal เพราะ logout portal ตัด Internet ของเครื่อง (ADR 0007 ของ radius-server)

ข้อควรทราบจากการตัดสินข้อ 3: บนเครื่องที่ใช้ร่วมกัน ถ้าคนก่อนไม่ได้ logout portal คนถัดไปที่กดปุ่ม Provider ID จะเข้า BackOffice เป็นคนก่อน (portal session อายุ 8 ชั่วโมง) ระบบลดความเสี่ยงโดยแสดงชื่อผู้ใช้ชัดเจนที่ header ตามเดิม แต่ไม่ป้องกันได้ทั้งหมด

## การทดสอบ

- radius-server (pytest + MariaDB ใน CI): authorize ตรวจ client/redirect/PKCE; session มีอยู่ → ได้ code; ไม่มี session → เก็บคำขอแล้วกลับมาทำต่อหลัง Provider login (mock client เดิม); สถานะไม่ใช่ approved ถูกปฏิเสธ; token ตรวจ secret/verifier, code ใช้ครั้งเดียว/หมดอายุ; ID token ไม่มีฟิลด์อ่อนไหว; JWKS ตรวจลายเซ็นได้; ไม่มีไฟล์ตั้งค่า → 503 ไม่มี test ส่ง packet RADIUS หรือเรียก MOPH จริง
- BackOffice unit (vitest): `OidcClient` ตรวจ token ด้วยกุญแจทดสอบ (iss/aud/exp/nonce/ลายเซ็นผิด), route start/callback/link, หน้า login แสดง/ซ่อนปุ่ม, หน้า admin ใช้ FormDialog/ActionDialog
- BackOffice integration (MariaDB): unique constraints, link/unlink + audit + revoke session ใน transaction เดียว, migration ใหม่
- end-to-end ด้วย Playwright: BackOffice กับ portal จำลอง (OIDC stub ใน test) ครอบคลุม linked, unlinked → ผูกเอง, admin ผูก

## ลำดับส่งงาน

1. PR radius-server: endpoint OIDC + การตั้งค่า + runbook ลงทะเบียน client (ปิดไว้จนกว่าจะสร้างไฟล์ตั้งค่า)
2. PR BackOffice: ตาราง, core service, routes, หน้าจอ (ปุ่มซ่อนจนกว่าจะตั้ง env)
3. เปิดใช้จริงต้องสร้าง secret/กุญแจบนเครื่อง portal และตั้ง env บนเครื่อง BackOffice ตาม runbook ซึ่งเป็นงานของผู้ดูแลเครื่อง ไม่อยู่ใน CI
