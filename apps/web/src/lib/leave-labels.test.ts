import { describe, expect, it } from 'vitest';
import { formatLeaveRange, leaveDaysLabel, leaveErrorMessage, leaveStatusLabel, leaveWarningText } from './leave-labels';

describe('leave labels', () => {
  it('names statuses, errors, days and warnings in Thai', () => {
    expect(leaveStatusLabel('IN_REVIEW')).toBe('รออนุมัติ');
    expect(leaveErrorMessage('INSUFFICIENT_BALANCE')).toBe('วันลาคงเหลือไม่พอ');
    expect(leaveErrorMessage('NOT_ELIGIBLE')).toBe('ประเภทการลานี้ไม่ตรงกับเพศในทะเบียนประวัติ');
    expect(leaveErrorMessage('SOMETHING_NEW')).toBe('ทำรายการไม่สำเร็จ ลองใหม่อีกครั้ง');
    expect(leaveDaysLabel(5, 'WORKING_DAYS')).toBe('5 วันทำการ');
    expect(leaveWarningText({ month: '2026-11', workingDays: 14, minimum: 15 })).toBe('เดือน พฤศจิกายน 2569 จะเหลือวันทำการ 14 วัน ต่ำกว่าขั้นต่ำ 15 วัน');
  });

  it('shows half days only where they apply', () => {
    expect(formatLeaveRange({ startDate: '2026-11-02', endDate: '2026-11-02', startHalf: 'FULL', endHalf: 'MORNING' })).toBe('2 พ.ย. 2569 (ครึ่งวันเช้า)');
    expect(formatLeaveRange({ startDate: '2026-11-02', endDate: '2026-11-04', startHalf: 'AFTERNOON', endHalf: 'FULL' })).toBe('2 พ.ย. 2569 (ครึ่งวันบ่าย) – 4 พ.ย. 2569');
  });
});
