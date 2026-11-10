import type { LabMemberRole, LabMovementKind, LabOpeningStatus, LabRequisitionStatus } from '@backoffice/contracts';

/** Thai names for the Lab stock enums (CONTEXT.md "วัสดุคงคลัง Lab"). Kept beside the module, not in the shared dictionary. */
const roles: Record<LabMemberRole, string> = { HEAD: 'หัวหน้า Lab', KEEPER: 'ผู้ดูแลคลัง Lab', STAFF: 'เจ้าหน้าที่ Lab' };
const movements: Record<LabMovementKind, string> = {
  OPENING: 'ยอดยกมา', RECEIPT: 'รับเข้า', RECEIPT_VOID: 'ยกเลิกใบรับ', ISSUE_OUT: 'จ่ายออก', ISSUE_IN: 'รับจากคลังหลัก',
  USE: 'ตัดใช้', USE_REVERSAL: 'ยกเลิกการตัดใช้', ADJUSTMENT: 'ปรับยอด'
};
const requisitionStatuses: Record<LabRequisitionStatus, string> = {
  SUBMITTED: 'รออนุมัติ', RETURNED: 'ส่งกลับแก้ไข', REJECTED: 'ไม่อนุมัติ', APPROVED: 'รอจ่าย', ISSUED: 'จ่ายแล้ว', CANCELLED: 'ยกเลิก'
};
const openingStatuses: Record<LabOpeningStatus, string> = { DRAFT: 'กำลังกรอก', SUBMITTED: 'รอรับรอง', CERTIFIED: 'รับรองแล้ว' };

export const labRoleLabel = (value: LabMemberRole) => roles[value];
export const labMovementKindLabel = (value: LabMovementKind) => movements[value];
export const labRequisitionStatusLabel = (value: LabRequisitionStatus) => requisitionStatuses[value];
export const labOpeningStatusLabel = (value: LabOpeningStatus) => openingStatuses[value];
