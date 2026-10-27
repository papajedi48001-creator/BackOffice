import { describe, expect, it } from 'vitest';
import { leaveBulkApproveInputSchema, leaveCancelDaysInputSchema, leaveEntitlementInputSchema, leaveHolidayInputSchema, leaveRangeSchema, leaveRequestInputSchema, leaveSettingInputSchema, leaveTypeCreateInputSchema, leaveTypeInputSchema } from './leave';

const request = { leaveTypeId: 'type-1', startDate: '2026-11-02', endDate: '2026-11-06', reason: 'พักผ่อน' };
const messageOf = (result: { success: boolean; error?: { issues: readonly { message: string }[] } }) => result.error?.issues[0]?.message;

describe('leave contracts', () => {
  it('validates leave ranges and inputs', () => {
    expect(messageOf(leaveRangeSchema.safeParse({ startDate: '2026-11-03', endDate: '2026-11-02' }))).toBe('END_BEFORE_START');
    expect(messageOf(leaveRangeSchema.safeParse({ startDate: '2026-11-02', endDate: '2026-11-02', startHalf: 'AFTERNOON', endHalf: 'MORNING' }))).toBe('EMPTY_DAY');
    expect(leaveRangeSchema.parse({ startDate: '2026-11-02', endDate: '2026-11-02', endHalf: 'MORNING' })).toEqual({ startDate: '2026-11-02', endDate: '2026-11-02', startHalf: 'FULL', endHalf: 'MORNING' });
    expect(leaveRangeSchema.safeParse({ startDate: '2026-02-30', endDate: '2026-03-02' }).success).toBe(false);
    expect(leaveRequestInputSchema.safeParse({ ...request, personId: 'someone' }).success).toBe(false);
    expect(leaveRequestInputSchema.safeParse({ ...request, reason: '  ' }).success).toBe(false);
    expect(leaveRequestInputSchema.parse({ ...request, contactDuringLeave: null }).startHalf).toBe('FULL');
    expect(leaveCancelDaysInputSchema.safeParse({ startDate: '2026-11-03', endDate: '2026-11-04', reason: 'กลับมาทำงาน' }).success).toBe(true);
    expect(leaveBulkApproveInputSchema.safeParse({ requestIds: [] }).success).toBe(false);
    expect(leaveBulkApproveInputSchema.safeParse({ requestIds: Array.from({ length: 101 }, (_, index) => `r${index}`) }).success).toBe(false);
    expect(leaveBulkApproveInputSchema.safeParse({ requestIds: ['r1', 'r2'] }).success).toBe(true);
  });

  it('validates the settings HR edits', () => {
    const type = { name: 'ลาป่วย', counting: 'WORKING_DAYS', approvalTarget: 'HOSPITAL', attachmentRequiredFromDays: 30, isActive: true, sortOrder: 1 };
    expect(leaveTypeInputSchema.safeParse(type).success).toBe(true);
    expect(leaveTypeInputSchema.safeParse({ ...type, attachmentRequiredFromDays: 0.3 }).success).toBe(false);
    expect(leaveTypeInputSchema.safeParse({ ...type, approvalTarget: 'FIRST' }).success).toBe(false);
    expect(leaveTypeCreateInputSchema.safeParse({ ...type, code: 'sick' }).success).toBe(false);
    expect(leaveTypeCreateInputSchema.safeParse({ ...type, code: 'SICK' }).success).toBe(true);
    const entitlement = { employmentTypeId: 'e1', leaveTypeId: 't1', daysPerYear: 10, firstYearDays: null, maxAccumulatedDays: 20, maxAccumulatedDaysAfter10Years: 30, minServiceMonths: 6 };
    expect(leaveEntitlementInputSchema.safeParse(entitlement).success).toBe(true);
    expect(leaveEntitlementInputSchema.safeParse({ ...entitlement, daysPerYear: 10.25 }).success).toBe(false);
    expect(leaveEntitlementInputSchema.safeParse({ ...entitlement, minServiceMonths: 1.5 }).success).toBe(false);
    expect(leaveHolidayInputSchema.safeParse({ date: '2026-12-05', name: 'วันพ่อแห่งชาติ' }).success).toBe(true);
    expect(leaveHolidayInputSchema.safeParse({ date: '2026-12-32', name: 'x' }).success).toBe(false);
    expect(leaveSettingInputSchema.safeParse({ minWorkingDaysPerMonth: 32 }).success).toBe(false);
    expect(leaveSettingInputSchema.safeParse({ minWorkingDaysPerMonth: 15 }).success).toBe(true);
  });

  it('takes an optional attachment id on a ใบลา', () => {
    const leave = { leaveTypeId: 'type-1', startDate: '2026-11-02', endDate: '2026-11-02', reason: 'ป่วย' };
    expect(leaveRequestInputSchema.parse({ ...leave, attachmentId: '00000000-0000-4000-8000-000000000001' }).attachmentId).toBe('00000000-0000-4000-8000-000000000001');
    expect(leaveRequestInputSchema.parse({ ...leave, attachmentId: null }).attachmentId).toBeNull();
    expect(leaveRequestInputSchema.safeParse({ ...leave, attachmentId: '../x' }).success).toBe(false);
  });
});
