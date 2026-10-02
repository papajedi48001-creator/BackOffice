# Waritch Hospital Back Office Design

## Purpose

สร้าง Back Office สำหรับบุคลากรภายในโรงพยาบาลวาริชภูมิ เพื่อจัดการงานสนับสนุนที่มีข้อมูลและสายอนุมัติร่วมกันอย่างตรวจสอบได้ ระบบเป็น Thai-first และออกแบบให้เพิ่มโมดูลได้โดยไม่กระทบโมดูลเดิมโดยไม่จำเป็น

## Success Criteria

- บุคลากรเข้าสู่ระบบผ่าน SSO/OIDC ได้เมื่อ SSO พร้อม และใช้ local account ชั่วคราวได้ระหว่างเปลี่ยนผ่าน
- ทุกคำขอที่มีผลต่อทรัพยากรหรือสิทธิ์มีเลขอ้างอิง สถานะ ผู้พิจารณา เหตุผล และ audit trail ที่ตรวจย้อนหลังได้
- สิทธิ์ข้อมูลใช้ role, หน่วยงาน, เจ้าของข้อมูล และ delegation ที่มีช่วงเวลาเป็นเงื่อนไข
- ข้อมูลอ่อนไหวถูกปกปิดตามบทบาท และทุก export อยู่ภายใต้สิทธิ์เฉพาะและ audit trail
- แต่ละ release นำร่องกับเจ้าของงานจริงได้โดยมี UAT, backup-restore, คู่มือ และ KPI ก่อนขยายผล

## Scope and Boundaries

ระบบรองรับองค์กรเดียว แต่มี `site` และ `location` สำหรับระบุอาคารหรือจุดบริการ ไม่มี multi-tenant ในรุ่นแรก ระบบใช้ภายในผ่าน HTTPS; การเข้าถึงจากภายนอกต้องผ่าน VPN หรือ zero-trust gateway

ระบบไม่รวมการตัดงบจริง การคำนวณเงินเดือน การคิดค่าเสื่อมอัตโนมัติ การจัดซื้อเต็มวงจร การจัดการเครือข่ายเชิงลึก หรือการออกเอกสารภาษีผู้บริจาคในรุ่นแรก งานวิกฤตในช่วงระบบขัดข้องใช้แบบฟอร์มกระดาษ/Excel ที่ควบคุมได้ และต้องบันทึกย้อนหลังพร้อมเหตุผลเมื่อระบบกลับมา

## Architecture

ใช้ **modular monolith + worker แยกงานเบื้องหลัง**:

- `apps/web`: Next.js App Router สำหรับ React UI, server-side API/actions, authorization และ Thai-first i18n
- `apps/worker`: ประมวลผล queue, sync SSO/เครื่องลงเวลา, ส่งอีเมล, SLA reminder, import และรายงานที่ใช้เวลานาน
- `packages/modules`: business rules และ use cases ของแต่ละ domain module
- `packages/shared`: identity, authorization, workflow, audit, notification, files, validation และ reference data
- `packages/contracts`: event และ API contracts ระหว่าง web กับ worker
- MariaDB เป็นฐานข้อมูลธุรกรรมหลัก, Redis ใช้ queue/cache, private object storage เก็บไฟล์แนบ

โมดูลเป็นเจ้าของข้อมูลของตนเองโดยเชิงตรรกะ: โมดูลอื่นอ่านหรืออ้างอิงด้วย ID/API/event ที่ระบุไว้เท่านั้น และไม่แก้ข้อมูลหลักของโมดูลอื่นโดยตรง ระบบใช้ outbox ภายใน MariaDB เพื่อทำให้ transaction สำเร็จก่อน worker ส่ง notification หรือดำเนินงานภายนอก การแยกเป็น service อิสระทำได้ภายหลังเฉพาะเมื่อภาระงาน ทีม หรือข้อกำหนดการแยกความเสี่ยงมีเหตุผลรองรับ

## Core Platform

| Capability | Responsibilities |
|---|---|
| HR and organization | บุคลากร หน่วยงาน ตำแหน่ง ประวัติการสังกัด สายบังคับบัญชา site และ location |
| Identity and access | OIDC/SSO, local account ชั่วคราว, RBAC, สิทธิ์ระดับข้อมูล และการเชื่อม identity กับบุคลากร |
| Delegation | ผู้แทนตามช่วงเวลา เหตุผล และขอบเขตโมดูล พร้อมป้องกันผลประโยชน์ทับซ้อน |
| Workflow | คำขอ เลขอ้างอิง สายอนุมัติ snapshot และการตัดสินใจมาตรฐาน |
| Notification | in-app, อีเมล, SLA reminder และ LINE adapter ที่ยังไม่มี credential ในรุ่นแรก |
| Audit and export | ประวัติการกระทำ/เข้าถึง/export, masking และ separation of duties |
| Files | PDF/JPG/PNG, metadata, validation, malware scan และ retention policy |
| Integration | connector แยกตามแหล่งข้อมูล, scheduled import, idempotency และ error report |
| Reference data | ประเภททรัพยากร วันหยุด ประเภทลา ระดับ SLA และข้อมูลกำหนดค่าร่วม |

### Identity and HR

HR เป็น master ของบุคลากรและโครงสร้างองค์กร ทุกโมดูลอ้างอิง `person_id` ภายในที่เป็น UUID ไม่ใช้เลขบัตรประชาชนเป็น primary key หรือ identifier ใน URL

เลขบัตรประชาชนอยู่ในขอบเขต HR เท่านั้น: เข้ารหัสขณะเก็บ, มี HMAC lookup index สำหรับจับคู่กับ SSO, แสดงแบบ mask, และไม่ปรากฏใน audit log, URL, export ทั่วไป หรือ notification. ตาราง `identity_link` เก็บ issuer และ subject ของ OIDC เพื่อเชื่อม identity กับ `person_id`.

ประวัติการสังกัดและสายบังคับบัญชามีวันเริ่ม/สิ้นสุด คำขอที่ส่งแล้วเก็บ snapshot ของผู้ขอ หน่วยงาน และผู้อนุมัติ ณ เวลายื่น จึงไม่เปลี่ยนผู้อนุมัติย้อนหลังเมื่อบุคลากรย้ายหน่วยงาน

ผู้ดูแลระบบเทคนิคไม่ได้รับสิทธิ์เห็นข้อมูล HR/ผู้บริจาคโดยอัตโนมัติ เจ้าของข้อมูลเป็นผู้รับผิดชอบความถูกต้องของข้อมูลธุรกิจและอนุมัติการให้สิทธิ์ที่เกี่ยวข้อง

### Workflow

สถานะกลางคือ `DRAFT → SUBMITTED → IN_REVIEW`. จาก `IN_REVIEW` อาจเป็น `RETURNED`, `REJECTED`, `CANCELLED` หรือ `APPROVED`; หลังอนุมัติ โมดูลธุรกิจจัดการ `FULFILLED` หรือสถานะปฏิบัติงานเฉพาะของตนเอง เช่น `WAITING_FOR_PARTS`.

การอนุมัติ ปฏิเสธ ส่งกลับแก้ไข และยกเลิกต้องเก็บผู้กระทำ เวลา เหตุผล และเลขอ้างอิง ผู้ขอยกเลิกได้ก่อนเริ่มใช้ทรัพยากรหรือเริ่มดำเนินการตามนโยบายของโมดูล ห้ามข้ามขั้นโดยปกติ ยกเว้นสายอนุมัติที่เจ้าของข้อมูลกำหนดพร้อมเหตุผลใน audit trail

delegation ต้องระบุผู้มอบ ผู้แทน ช่วงเวลา เหตุผล และขอบเขต ห้ามผู้แทนอนุมัติคำขอของตนเองหรือคำขอที่ตนมีผลประโยชน์เกี่ยวข้อง

## Business Modules

| Module | Data owner | Owned data and behavior | Relationships |
|---|---|---|---|
| HR | HR | บุคลากร หน่วยงาน ตำแหน่ง ประวัติการสังกัด | แหล่งอ้างอิงของทุกโมดูล |
| Maintenance | ทีมช่าง/IT/ผู้รับเหมาที่รับผิดชอบ | ใบงาน การคัดแยก SLA มอบหมายและผลซ่อม | อ้างอิง asset/อุปกรณ์เมื่อมี และขอเบิกคลังได้ |
| Inventory | พัสดุ | รับเข้า เบิก โอน ปรับยอด จุดสั่งซื้อขั้นต่ำ | เบิกวัสดุสำหรับใบงานซ่อม/IT |
| Room booking | ธุรการ | ห้อง นโยบายการจอง ตารางจอง | ใช้ workflow และ calendar/resource reservation กลาง |
| Fleet | ธุรการ/ยานพาหนะ | รถ ผู้ขับ ตารางใช้รถ ปลายทาง | ใช้ reservation เดียวกับห้อง แต่นโยบายเฉพาะรถ |
| Attendance | HR | รายการเวลา import, error queue, ข้อยกเว้น | รับจาก connector และเชื่อมการอุทธรณ์/วันลา |
| Leave | HR | ประเภทลา สิทธิ์คงเหลือ คำขอลา | การอนุมัติเป็นข้อมูลอ้างอิงให้ลงเวลา ไม่คิดเงินเดือน |
| Asset register | การเงินหรือพัสดุ | รหัสทรัพย์สิน สถานที่ ผู้รับผิดชอบ สถานะ | เชื่อมประวัติซ่อมและอุปกรณ์ IT; ไม่มีค่าเสื่อมอัตโนมัติ |
| Computer center | IT | service desk, SLA, knowledge base, อุปกรณ์ IT | ใช้ศูนย์รับแจ้งเดียวกับงานซ่อม และเชื่อม asset register |
| Planning | แผนงาน/การเงิน | โครงการ กิจกรรม KPI และสถานะอนุมัติ | โมดูลอื่นอ้างอิงรหัสโครงการได้; ไม่ตัดงบ |
| Donor registry | หน่วยรับบริจาค/การเงิน | ผู้บริจาค ความประสงค์ รับมอบ การขอบคุณ | สิทธิ์/retention เข้ม; ไม่ออกเอกสารภาษีรุ่นแรก |

งานซ่อมเริ่มก่อนทะเบียนทรัพย์สินได้ โดยอ้างอิงรายการอุปกรณ์หรือสถานที่ชั่วคราว แล้วผูก `asset_id` ภายหลังเมื่อทะเบียนทรัพย์สินพร้อม ห้องทั่วไปยืนยันอัตโนมัติหากว่างตามนโยบาย ส่วนห้อง/รถที่มีข้อจำกัดต้องผ่านเจ้าของทรัพยากร และทุกการจองป้องกันช่วงเวลาทับซ้อนเชิงธุรกรรม

ระบบลงเวลานำเข้าจากเครื่องหรือระบบเดิมผ่าน CSV/SFTP, read-only API หรือช่องทางที่แหล่งข้อมูลรองรับ ทุก 15–60 นาทีตามความสามารถของต้นทาง การนำเข้าทำซ้ำได้, รายงานแถวผิดพลาดได้ และไม่แก้ข้อมูลต้นทาง บุคลากรยื่นคำอุทธรณ์ไป HR ได้; ระบบเก็บคำตัดสินและสถิติการอุทธรณ์

## Data and Security Requirements

- ใช้ UUID ทุก entity, UTC ในฐานข้อมูล และแสดงเวลา Asia/Bangkok
- ตรวจสิทธิ์ฝั่ง server ทุก action ด้วย role + หน่วยงาน + data ownership; UI ไม่ใช่ขอบเขตความปลอดภัย
- audit log append-only เชิงตรรกะ บันทึก actor, action, target, timestamp, result และ metadata ที่ผ่านการ redaction
- export แยกสิทธิ์จากการดูข้อมูล, บันทึกผู้ส่งออก เหตุผล ช่วงข้อมูล และใช้ masking ตาม role พร้อม URL ดาวน์โหลดชั่วคราว
- upload จำกัด PDF/JPG/PNG, ตรวจ MIME/ขนาด, สแกนมัลแวร์ และเก็บ private object storage; ไฟล์เข้าถึงผ่าน authorization เท่านั้น
- retention policy กำหนดค่าตามชนิดข้อมูล โดยต้องได้อนุมัติจากผู้รับผิดชอบกฎหมาย/PDPA ก่อนเปิดโมดูล HR, ผู้บริจาค หรือเอกสารแนบที่เกี่ยวข้อง
- ห้ามเก็บ token, password, เลขบัตรประชาชน หรือเนื้อหาไฟล์แนบใน log/audit/notification

## Deployment and Operations

ติดตั้งด้วย Docker Compose บน Linux VM แยก staging และ production. Reverse proxy (Caddy หรือ Traefik) เป็นจุดรับ HTTPS เพียงจุดเดียว; web/API, worker, MariaDB, Redis และ object storage อยู่ใน internal network และไม่เปิด database port สู่ภายนอก

monitoring ต้องครอบคลุม health ของ service, พื้นที่ดิสก์, backup ล่าสุด, queue backlog และ error rate ของ connector. เก็บ secrets เป็น protected secret files หรือ secret manager ใน production และห้าม commit `.env` หรือ credential ใน repository.

Backup MariaDB และไฟล์แนบแบบเข้ารหัสรายวัน โดยมีเป้าหมาย RPO ไม่เกิน 24 ชั่วโมง ทดสอบ restore ใน staging เป็นรอบ และจัดทำ runbook สำหรับ deploy, rollback, restore, connector failure, secret rotation และการบันทึกย้อนหลังหลังระบบขัดข้อง

## Delivery Roadmap

| Release | Deliverable | Pilot gate |
|---|---|---|
| R0 Foundation | HR ขั้นพื้นฐาน, org/site/location, identity, RBAC, delegation, workflow, audit, files, notification, monitoring/backup | restore ผ่าน, สิทธิ์/audit/export ผ่าน, HR master data ตรวจสอบแล้ว |
| R1 Maintenance | ศูนย์รับแจ้ง, ใบงาน, SLA 4 ระดับ, มอบหมาย/ส่งต่อ, เอกสารประกอบ | ผู้ใช้ช่าง/IT ปิดงานตาม workflow และวัด SLA ได้ |
| R2 Inventory | รับเข้า, เบิก, โอน, ปรับยอด, reorder point, เชื่อมใบงาน | พัสดุรับรองยอดคงเหลือเปิดระบบ |
| R3 Rooms and fleet | reservation, calendar, conflict prevention, auto/manual approval | ธุรการยืนยันการจองจริงและไม่มี conflict |
| R4 Attendance and leave | connector, error queue, appeals/statistics, leave entitlement/request | HR ตรวจ sample import และ workflow อุทธรณ์ผ่าน |
| R5 Assets and IT | asset register, repair history, IT assets, service desk/SLA/knowledge base | master data ทรัพย์สินและผู้รับผิดชอบผ่านการตรวจสอบ |
| R6 Planning and donors | projects/activities/KPI, donor registry | PDPA/retention และเจ้าของข้อมูลอนุมัติก่อน pilot |

## Quality and Release Controls

- Unit tests ครอบคลุม authorization, delegation, workflow, SLA, masking และ validation
- Integration tests ใช้ MariaDB ครอบคลุม transaction, outbox/worker, idempotent import, concurrent reservation และ inventory adjustment
- End-to-end tests ครอบคลุมผู้ขอ → ผู้อนุมัติ → ผู้ปฏิบัติงาน → audit/export สำหรับทุก release
- ตรวจ security ด้วย authorization tests, upload tests, secret scan และ dependency scan
- CI ต้องผ่าน lint, typecheck, tests, build container และ migration validation
- deploy staging หลัง CI; production ต้องมี approval, backup สำเร็จ, migration, health check และ smoke test
- go-live ต้องผ่าน UAT, master-data sign-off, คู่มือ/runbook, การอบรม pilot, restore drill และ KPI baseline

## Implementation Plan Boundaries

สเปกนี้เป็นสถาปัตยกรรมรวม แต่การลงมือทำต้องแยก implementation plan และ review gate ต่อ release: R0 เป็นแผนแรก, R1–R6 เริ่มได้หลัง R0 ให้ interfaces ที่จำเป็นและผลของ pilot กำหนดรายละเอียดโมดูลถัดไป การเปลี่ยน retention, SSO claim mapping, connector format, SLA target ตัวเลข และระเบียบเอกสารทางกฎหมายต้องได้รับการยืนยันจากเจ้าของข้อมูลก่อนเป็น requirements สำหรับ release ที่เกี่ยวข้อง
