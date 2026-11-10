import { describe, expect, it } from 'vitest';
import { canManageAttendance, canManageAttendanceDevices, canReadAttendanceAudit } from './attendance-access';

const subject = (roles: string[]) => ({ authenticated: true, personId: 'p', roles: roles.map((name) => ({ name, organizationId: null })), dataOwnerModules: [] });

describe('attendance access', () => {
  it('lets the ผู้จัดการระบบลงเวลา and the ผู้ดูแลระบบ manage settings and boxes, nobody else', () => {
    for (const roles of [['attendance-manager'], ['admin']]) {
      expect(canManageAttendance(subject(roles))).toBe(true);
      expect(canManageAttendanceDevices(subject(roles))).toBe(true);
      expect(canReadAttendanceAudit(subject(roles))).toBe(true);
    }
    expect(canManageAttendance(subject([]))).toBe(false);
    expect(canManageAttendanceDevices(subject(['fleet-manager']))).toBe(false);
    expect(canManageAttendance({ ...subject(['attendance-manager']), authenticated: false })).toBe(false);
  });
  it('lets the ผู้ตรวจสอบระบบลงเวลา read the audit only', () => {
    expect(canReadAttendanceAudit(subject(['attendance-auditor']))).toBe(true);
    expect(canManageAttendance(subject(['attendance-auditor']))).toBe(false);
    expect(canManageAttendanceDevices(subject(['attendance-auditor']))).toBe(false);
  });
});
