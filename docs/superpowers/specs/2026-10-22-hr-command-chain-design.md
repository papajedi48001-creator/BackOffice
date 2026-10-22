# HR Command Chain Design (สายบังคับบัญชา)

**Status:** draft for review
**Date:** 2026-10-22
**Source:** HR thread brainstorming with wasan (2026-10-22); first of five HR sub-projects

## Purpose

ให้ทุก **โมดูล** หาผู้อนุมัติจากโครงสร้าง **หน่วยงาน** ได้จากที่เดียว: ไล่จากหน่วยงานของผู้ยื่นขึ้นไปทีละชั้น แล้วเก็บ **หัวหน้าหน่วยงาน** ของแต่ละชั้นจนถึง **ชนิดหน่วยงาน** เป้าหมายที่โมดูลกำหนด เช่น การลาไปถึงหัวหน้ากลุ่มงาน และไปราชการไปถึงผู้อำนวยการ งานนี้สร้างแค่กลไกกับข้อมูลที่กลไกต้องใช้ ส่วนกติกาว่าคำขอชนิดใดต้องไปถึงชั้นไหน กำหนดในงานย่อยการลาและการไปราชการ

## HR roadmap (context)

ระบบ HR แบ่งเป็นงานย่อย 5 งาน แต่ละงานมี spec, plan และ PR ของตัวเอง เรียงตามลำดับที่งานหลังต้องใช้ของจากงานก่อน:

1. **สายบังคับบัญชา** (เอกสารนี้)
2. ทะเบียนประวัติบุคลากร
3. การลา
4. การไปราชการ
5. สแกนเข้า/ออกเวร (อนาคต)

## Current behaviour

- `organization` มี `parent_id` จึงเป็นลำดับชั้นอยู่แล้ว แต่ยังไม่มีชนิดหน่วยงาน และยังไม่มีหัวหน้าหน่วยงาน
- `DatabaseApproverResolver` (`apps/web/src/lib/database-approver-resolver.ts`) คืนผู้อนุมัติได้คนเดียว คือ `employment_assignment.manager_person_id` ของผู้ยื่นในหน่วยงานที่ยื่น
- `ApprovalService` ยอมให้ผู้รับ **มอบอำนาจ** ที่ยังมีผลตัดสินแทนผู้อนุมัติได้อยู่แล้ว (`ActiveDelegationFinder`)
- `RequestService` ตรึงผู้อนุมัติเป็น `ApprovalStep` ตอนยื่น (**ภาพผู้อนุมัติ ณ เวลายื่น**) และโยน `NO_APPROVER` เมื่อรายชื่อว่าง

## Decisions

| เรื่อง | ทางเลือกที่ใช้ | เหตุผล |
|---|---|---|
| ที่มาของสาย | ไล่ตามหัวหน้าหน่วยงานผ่าน `parent_id` | เมื่อเปลี่ยนตัวหัวหน้า HR แก้จุดเดียว ไม่ต้องแก้ทุกคน (wasan เลือก) |
| จุดหยุด | ระบุเป็นชนิดหน่วยงานเป้าหมาย ไม่ใช่จำนวนชั้น | แต่ละแผนกมีความลึกไม่เท่ากัน (wasan เลือก) |
| ชนิดหน่วยงาน | 3 ค่า: `SECTION` งาน, `DIVISION` กลุ่มงาน, `HOSPITAL` โรงพยาบาล; คอลัมน์เป็น NULL ได้ | ตรงกับโครงสร้างของโรงพยาบาล (wasan ยืนยัน); NULL ทำให้ migration เป็นแบบ additive และหน่วยที่ยังไม่ได้ตั้งค่าก็ยังอยู่ในสายได้ |
| หัวหน้าไม่อยู่ | ใช้การมอบอำนาจเดิม สายยังตรึงชื่อหัวหน้าตัวจริง | มีอยู่แล้วพร้อมบันทึกการตรวจสอบ (wasan เลือก) |
| ผู้ยื่นเป็นหัวหน้าเอง | ข้ามชั้นนั้นขึ้นไป | คนไม่อนุมัติคำขอของตัวเอง |
| หน่วยไม่มีหัวหน้า หรือหัวหน้าสถานะ `INACTIVE` | ข้ามชั้นนั้น และคืนรหัสหน่วยที่ข้ามไว้ให้ผู้เรียกบันทึก | คำขอไม่ติดค้าง และ HR เห็นจุดที่ต้องแก้ |
| คนเดียวเป็นหัวหน้าหลายชั้น | ใส่ชื่อครั้งเดียว ในชั้นล่างสุดที่พบ | ไม่ต้องกดอนุมัติซ้ำ |
| ประวัติหัวหน้า | ตาราง `hr_organization_head` มี `effective_from`/`effective_until`; ตั้งหัวหน้าใหม่ = ปิดวาระเดิม + เปิดวาระใหม่ ใน transaction เดียว | ย้อนดูได้ว่าใครเป็นหัวหน้าเมื่อไร; คำขอเดิมไม่เปลี่ยนเพราะตรึงไว้แล้ว |
| คำขอกลาง (`requests`) | เปลี่ยนมาใช้กลไกนี้ แบบ `NEAREST_HEAD` (หัวหน้าชั้นแรกที่พบคนเดียว); ถ้าได้ผลว่าง ใช้ `manager_person_id` เดิมแทน | พฤติกรรมเดิมเป็นขั้นเดียว; ใช้ค่าเดิมสำรองไว้ระหว่างที่ HR ยังตั้งหัวหน้าไม่ครบ คำขอจึงไม่เริ่มล้มด้วย `NO_APPROVER` |

## Domain terms (add to CONTEXT.md)

- **ชนิดหน่วยงาน**: ระดับของหน่วยงานในโครงสร้างโรงพยาบาล มี 3 ค่า คือ งาน กลุ่มงาน และโรงพยาบาล ใช้เป็นจุดหยุดของสายบังคับบัญชา _Avoid_: level, tier
- **หัวหน้าหน่วยงาน**: บุคลากรที่มีอำนาจบังคับบัญชาหน่วยงานหนึ่งในช่วงเวลาที่กำหนด หน่วยงานหนึ่งมีหัวหน้าได้ครั้งละหนึ่งคน _Avoid_: manager, ผู้จัดการ
- **สายบังคับบัญชา**: ลำดับหัวหน้าหน่วยงานจากหน่วยงานของผู้ยื่นขึ้นไปจนถึงชนิดหน่วยงานเป้าหมาย ใช้สร้าง **สายอนุมัติ** _Avoid_: chain of command, org chart

## Data (migration `0009_hr_command_chain.sql`)

```sql
ALTER TABLE organization ADD COLUMN IF NOT EXISTS unit_type VARCHAR(16) NULL;
CREATE TABLE IF NOT EXISTS hr_organization_head (
  id VARCHAR(36) PRIMARY KEY,
  organization_id VARCHAR(36) NOT NULL,
  person_id VARCHAR(36) NOT NULL,
  effective_from DATETIME NOT NULL,
  effective_until DATETIME NULL,
  created_at DATETIME NOT NULL,
  INDEX hr_organization_head_active_index (organization_id, effective_until),
  INDEX hr_organization_head_person_index (person_id, effective_until)
);
```

- `unit_type` เป็น `SECTION` / `DIVISION` / `HOSPITAL` หรือ NULL ตรวจค่าที่ชั้น contracts (zod)
- หัวหน้าปัจจุบันของหน่วย = แถวที่ `effective_from <= now` และ (`effective_until IS NULL` หรือ `effective_until > now`) บริการรับประกันว่ามีไม่เกินหนึ่งแถวต่อหน่วย
- Drizzle schema อยู่ใน `packages/db/src/schema/hr.ts` และเพิ่มตารางใน `infra/backup/restore-verify.test.sh`
- เพิ่มแถว 0009 ในตาราง migration ของ `docs/integration/modules.md`

## Components

### `packages/contracts/src/hr.ts`
- `organizationUnitTypeSchema = z.enum(['SECTION', 'DIVISION', 'HOSPITAL'])`
- `commandChainTargetSchema = z.union([organizationUnitTypeSchema, z.literal('NEAREST_HEAD')])`
- `assignOrganizationHeadInputSchema` (`organizationId`, `personId`, `effectiveFrom`) และ `setOrganizationUnitTypeInputSchema` (`organizationId`, `unitType | null`)

### `packages/core/src/hr/command-chain.ts` (pure)

```ts
interface ChainUnit { id: string; parentId: string | null; unitType: OrganizationUnitType | null; head: { personId: string; active: boolean } | null; }
interface CommandChain { approvers: ApproverSnapshot[]; skippedOrganizationIds: string[]; reachedTarget: boolean; }
function resolveCommandChain(input: { units: Map<string, ChainUnit>; organizationId: string; requestorPersonId: string; target: CommandChainTarget }): CommandChain
```

ขั้นตอน: เริ่มที่ `organizationId` แล้วไล่ `parentId` ทีละชั้น ในแต่ละชั้น:
1. ถ้าไม่มีหัวหน้า หรือหัวหน้าไม่ active: เพิ่ม id ลง `skippedOrganizationIds`
2. ถ้าหัวหน้าเป็นผู้ยื่น หรือมีชื่ออยู่ในสายแล้ว: ข้าม (ไม่นับว่าเป็นหน่วยไม่มีหัวหน้า)
3. ถ้าไม่ใช่สองกรณีบน: เพิ่ม `{ personId, organizationId }` ต่อท้าย
4. หยุดเมื่อ `target === 'NEAREST_HEAD'` และเพิ่มผู้อนุมัติได้หนึ่งคนแล้ว หรือเมื่อ `unitType === target` (`reachedTarget = true`) หรือเมื่อถึงหน่วยบนสุด หรือเมื่อพบหน่วยที่เคยผ่านแล้ว (กันวงวน)

ถ้าไม่พบชนิดเป้าหมายจนถึงบนสุด กลไกคืนสายเท่าที่ได้ โดย `reachedTarget = false` ผู้เรียกเป็นผู้ตัดสินว่าจะยอมรับหรือไม่

### `packages/core/src/hr/command-chain-service.ts`
- `CommandChainService.resolve({ requestorPersonId, organizationId, target, at })` โหลดหน่วยงานพร้อมหัวหน้า ณ เวลา `at` ด้วย query เดียว (`organization LEFT JOIN hr_organization_head LEFT JOIN person`) แล้วเรียก `resolveCommandChain`
- `OrganizationHeadService.assign(input, actor)` ตรวจว่าหน่วยและบุคลากรมีอยู่จริง และบุคลากรสถานะ `ACTIVE` แล้วใน transaction เดียวทำสามอย่าง: ปิดวาระปัจจุบันด้วย `effective_until = effectiveFrom`, เพิ่มแถวใหม่ และเขียน audit `hr.organization.head.assign` (metadata: `organizationId`, `personId`) ถ้าคนเดิมเป็นหัวหน้าอยู่แล้ว ไม่ทำอะไร `effectiveFrom` ต้องไม่ก่อนวันเริ่มของวาระปัจจุบัน
- `OrganizationHeadService.setUnitType(input, actor)` อัปเดต `unit_type` และเขียน audit `hr.organization.type.update` ใน transaction เดียว

### `apps/web/src/lib/database-approver-resolver.ts`
- เรียก `CommandChainService` ด้วย `target: 'NEAREST_HEAD'` ถ้าได้ผลว่าง ใช้ query `manager_person_id` เดิม
- อินเทอร์เฟซ `ApproverResolver` เพิ่ม `target` แบบไม่บังคับ โมดูลการลาและไปราชการจะส่งชนิดเป้าหมายมาเอง

## Screens and API

- **`/hr/organizations`**: แต่ละหน่วยงานในต้นไม้แสดงชนิดหน่วยงาน ชื่อหัวหน้าปัจจุบัน และป้าย "ยังไม่มีหัวหน้า" เมื่อไม่มีหัวหน้า ชื่อหน่วยลิงก์ไปหน้ารายละเอียด
- **`/hr/organizations/[organizationId]`**: แสดงชนิดหน่วยงาน หัวหน้าปัจจุบัน และประวัติหัวหน้า ผู้มี `hr.organization.manage` เห็นฟอร์มเลือกชนิดหน่วยงาน และฟอร์มตั้งหัวหน้า (ค้นหาด้วยรหัสบุคลากรหรือชื่อ พร้อมวันที่มีผล ค่าเริ่มต้นคือวันนี้ตามเวลา Asia/Bangkok) ผู้ที่มีแค่ `hr.person.read` ดูได้อย่างเดียว
- **API**: `PUT /api/hr/organizations/[organizationId]/unit-type` และ `POST /api/hr/organizations/[organizationId]/heads` ทั้งสอง route ตรวจ `hr.organization.manage` แบบทั้งโรงพยาบาลด้วย `AuthorizationService` ที่ server; ข้อผิดพลาดคืน 400/403/404 พร้อมรหัส เช่น `PERSON_NOT_ACTIVE`, `EFFECTIVE_FROM_BEFORE_CURRENT`
- ทำตาม `DESIGN.md` และข้อความไทยทั้งหมดอยู่ใน `packages/i18n/src/th.ts` ใช้ prefix `hr`

## CSV import

- ไฟล์หน่วยงานเพิ่มคอลัมน์ไม่บังคับ `unit_type` (รับ `งาน`/`กลุ่มงาน`/`โรงพยาบาล` หรือรหัสภาษาอังกฤษ) และ `head_employee_code`
- ไฟล์เดิมที่ไม่มีสองคอลัมน์นี้นำเข้าได้เหมือนเดิม ช่องว่างแปลว่าไม่แก้ค่าเดิม
- `head_employee_code` ต้องตรงกับบุคลากรในไฟล์บุคลากรชุดเดียวกัน หรือบุคลากรที่มีอยู่แล้ว ถ้าไม่ตรงคืน `UNKNOWN_HEAD`; ค่า unit_type ที่ไม่รู้จักคืน `UNKNOWN_UNIT_TYPE`
- ตอน apply ถ้าหัวหน้าเปลี่ยน ใช้วันที่ apply (UTC) เป็น `effective_from` ผ่านกติกาเดียวกับ `OrganizationHeadService` ภายใน transaction ของการนำเข้า

## Permissions

- เพิ่ม `hr.organization.manage` ใน `permissionSchema` และผูกกับ `hr-manager` ใน `policy.ts`
- `requiresDataOwner` คืน true สำหรับ `hr.organization.manage` เหมือน `hr.person.manage`
- registry ไม่ต้องเพิ่มเมนูใหม่ เพราะหน้ารายละเอียดอยู่ใต้เมนูหน่วยงานเดิม

## Privacy

audit metadata, log และ URL ใช้เฉพาะ `organizationId` และ `personId` ไม่มีเลขประจำตัวประชาชน งานนี้ไม่ส่งการแจ้งเตือน

## Error handling

- `resolveCommandChain` ไม่โยน error สายว่างให้ผู้เรียกตัดสิน (คำขอกลางโยน `NO_APPROVER` หลังลองค่าสำรองแล้ว)
- การตั้งหัวหน้าที่ขัดกติกาคืนรหัสข้อผิดพลาด และไม่บันทึกอะไรเลย

## Testing

- **Unit (`command-chain.test.ts`)**: ไล่ปกติ งาน → กลุ่มงาน → โรงพยาบาล; หยุดที่เป้าหมาย; `NEAREST_HEAD`; ผู้ยื่นเป็นหัวหน้าเอง; หน่วยไม่มีหัวหน้า; หัวหน้า inactive; คนเดียวเป็นหัวหน้าสองชั้น; ไม่พบเป้าหมายจนถึงบนสุด (`reachedTarget = false`); วงวนใน `parent_id`
- **Unit**: กติกา `OrganizationHeadService` (ปิดวาระเดิม, คนเดิมไม่ทำอะไร, วันที่ย้อนหลัง, บุคลากร inactive) ด้วย repository ในหน่วยความจำ; การตรวจไฟล์ CSV คอลัมน์ใหม่
- **Integration (MariaDB)**: migration 0009; `CommandChainService` ที่เวลาต่างกันได้หัวหน้าตามวาระ; การตั้งหัวหน้า + audit อยู่ใน transaction เดียว; `DatabaseApproverResolver` ใช้ค่าสำรองเมื่อไม่มีหัวหน้า
- **Web**: หน้าหน่วยงานแสดงหัวหน้าและป้ายเตือน; หน้ารายละเอียดซ่อนฟอร์มจาก hr-reader; API คืน 403 เมื่อไม่มีสิทธิ์

## Out of scope

- กติกาว่าคำขอชนิดใดไปถึงชั้นไหน (อยู่ในงานย่อยการลาและไปราชการ)
- ช่อง "รักษาการหัวหน้า" (ใช้การมอบอำนาจแทน)
- การแจ้งเตือนเมื่อถูกตั้งเป็นหัวหน้า
- การแก้หรือลบวาระหัวหน้าย้อนหลัง
