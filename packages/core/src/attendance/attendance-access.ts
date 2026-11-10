import type { AccessSubject } from '@backoffice/contracts';
import { AuthorizationService } from '../access/authorization-service';

const authorization = new AuthorizationService();
const hospitalWide = (subject: AccessSubject, permission: 'attendance.manage' | 'attendance.device.manage' | 'attendance.audit.read') => authorization.organizationScope(subject, permission) === 'all';

/** ผู้จัดการระบบลงเวลา (or ผู้ดูแลระบบ): settings, ประเภทเวร, จุดลงเวลา. */
export const canManageAttendance = (subject: AccessSubject): boolean => hospitalWide(subject, 'attendance.manage');
/** Pairing and revoking กล่องลงเวลา. */
export const canManageAttendanceDevices = (subject: AccessSubject): boolean => hospitalWide(subject, 'attendance.device.manage');
/** ผู้ตรวจสอบระบบลงเวลา and the managers: read the module's audit and check the hash chain. */
export const canReadAttendanceAudit = (subject: AccessSubject): boolean => hospitalWide(subject, 'attendance.audit.read');
