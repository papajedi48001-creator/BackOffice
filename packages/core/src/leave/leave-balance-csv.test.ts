import { describe, expect, it } from 'vitest';
import { validateLeaveBalances } from './leave-balance-csv';
import type { LeaveType } from './leave-settings-service';

const leaveTypes: LeaveType[] = [
  { id: 'type-vacation', code: 'VACATION', name: 'ลาพักผ่อน', counting: 'WORKING_DAYS', approvalTarget: 'HOSPITAL', attachmentRequiredFromDays: null, isActive: true, sortOrder: 3 },
  { id: 'type-sick', code: 'SICK', name: 'ลาป่วย', counting: 'WORKING_DAYS', approvalTarget: 'HOSPITAL', attachmentRequiredFromDays: 30, isActive: true, sortOrder: 1 }
];
const context = { people: new Map([['E001', 'person-1'], ['E002', 'person-2']]), leaveTypes };
const header = 'employee_code,display_name,leave_type,carried_days,used_days';

describe('validateLeaveBalances', () => {
  it('matches a leave type by code or Thai name', () => {
    const result = validateLeaveBalances(`\uFEFF${header}\nE001,สมชาย,VACATION,5,2.5\nE002,สมหญิง,ลาพักผ่อน,0,0\n`, context);
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([{ personId: 'person-1', leaveTypeId: 'type-vacation', carriedDays: 5, usedDays: 2.5 }, { personId: 'person-2', leaveTypeId: 'type-vacation', carriedDays: 0, usedDays: 0 }]);
  });

  it('names a missing column', () => {
    expect(validateLeaveBalances('employee_code,leave_type,carried_days\nE001,VACATION,1\n', context).errors).toEqual([{ row: 1, column: 'used_days', code: 'MISSING_COLUMN' }]);
  });

  it('reports each bad cell by row and column without its value', () => {
    const text = `${header}\nE999,ไม่รู้จัก,VACATION,1,0\nE001,สมชาย,ลาบวช,1,0\nE001,สมชาย,SICK,2.25,0\nE001,สมชาย,SICK,1,-1\nE002,สมหญิง,VACATION,1,0\nE002,สมหญิง,ลาพักผ่อน,2,0\n`;
    const { errors, rows } = validateLeaveBalances(text, context);
    expect(errors).toEqual([
      { row: 2, column: 'employee_code', code: 'UNKNOWN_EMPLOYEE' },
      { row: 3, column: 'leave_type', code: 'UNKNOWN_LEAVE_TYPE' },
      { row: 4, column: 'carried_days', code: 'INVALID_NUMBER' },
      { row: 5, column: 'used_days', code: 'INVALID_NUMBER' },
      { row: 7, column: 'leave_type', code: 'DUPLICATE_ROW' }
    ]);
    expect(JSON.stringify(errors)).not.toMatch(/E999|ลาบวช|2\.25|ไม่รู้จัก/);
    expect(rows).toHaveLength(1);
  });
});
