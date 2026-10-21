# มอบบทบาทโมดูลห้องประชุม

โมดูลห้องประชุมใช้บทบาทสองชื่อ (ดู ADR 0001, 0002 และ `CONTEXT.md` หมวด "ห้องประชุม")

| บทบาท (`role.name`) | สิทธิ์ | ใช้ทำอะไร |
|---|---|---|
| `room-manager` | `room.manage` | **ผู้จัดการห้องประชุม**: เพิ่ม/แก้ไขห้อง เปิดปิดการจอง และจัดการรายการเสริม |
| `room-booking-approver` | `room.booking.decide` | **ผู้อนุมัติการจองห้อง**: อนุมัติ ไม่อนุมัติ และยกเลิกการจอง ได้รับแจ้งเมื่อมีการจองรออนุมัติ |

- `role_assignment.organization_id = NULL` ใช้ได้กับทุกห้อง; ถ้าระบุหน่วยงาน จะใช้ได้เฉพาะห้องที่หน่วยงานนั้นเป็นเจ้าของ
- ผู้ถือบทบาทพิจารณาการจองของตนเองไม่ได้
- บุคลากรทุกคนที่เข้าระบบจองห้องและดูปฏิทินได้โดยไม่ต้องมีบทบาท

จนกว่าจะมีหน้ามอบบทบาท ให้ผู้ดูแลระบบมอบผ่านฐานข้อมูลหลังได้รับอนุมัติจากเจ้าของข้อมูล (ธุรการ) และบันทึกเหตุผลไว้ในใบงาน:

```sql
INSERT IGNORE INTO role (id, name, created_at) VALUES (UUID(), 'room-booking-approver', UTC_TIMESTAMP());
INSERT INTO role_assignment (id, person_id, role_id, organization_id, created_at)
SELECT UUID(), '<person_id>', id, NULL, UTC_TIMESTAMP() FROM role WHERE name = 'room-booking-approver';
```

สิทธิ์มีผลในคำขอถัดไปเพราะ session โหลดบทบาทจากฐานข้อมูลทุกครั้ง
