import { describe, expect, it } from 'vitest';
import { computeBalance, serviceMonths, type Entitlement } from './leave-balance';

const personal: Entitlement = { daysPerYear: 45, firstYearDays: 15, maxAccumulatedDays: null, maxAccumulatedDaysAfter10Years: null, minServiceMonths: 0 };
const vacation: Entitlement = { daysPerYear: 10, firstYearDays: null, maxAccumulatedDays: 20, maxAccumulatedDaysAfter10Years: 30, minServiceMonths: 6 };
const base = { opening: null, approvedDays: 0, cancelledDays: 0, pendingDays: 0, previousYearRemaining: null };

describe('computeBalance', () => {
  it('uses first-year days in the fiscal year of appointment', () => {
    expect(computeBalance({ ...base, carries: false, entitlement: personal, fiscalYear: 2570, appointedOn: '2026-11-15' }).entitled).toBe(15);
    expect(computeBalance({ ...base, carries: false, entitlement: personal, fiscalYear: 2571, appointedOn: '2026-11-15' }).entitled).toBe(45);
    expect(computeBalance({ ...base, carries: false, entitlement: personal, fiscalYear: 2570, appointedOn: null }).entitled).toBe(45);
  });

  it('caps vacation carry at 20 before 10 years and 30 after', () => {
    expect(computeBalance({ ...base, carries: true, entitlement: vacation, fiscalYear: 2570, appointedOn: '2020-01-01', previousYearRemaining: 18 }).carried).toBe(10);
    expect(computeBalance({ ...base, carries: true, entitlement: vacation, fiscalYear: 2570, appointedOn: '2010-01-01', previousYearRemaining: 25 }).carried).toBe(20);
    expect(computeBalance({ ...base, carries: true, entitlement: vacation, fiscalYear: 2570, appointedOn: '2020-01-01', previousYearRemaining: -2 }).carried).toBe(0);
    expect(computeBalance({ ...base, carries: true, entitlement: { ...vacation, maxAccumulatedDays: null, maxAccumulatedDaysAfter10Years: null }, fiscalYear: 2570, appointedOn: '2020-01-01', previousYearRemaining: 8 }).carried).toBe(0);
  });

  it('prefers the opening row', () => {
    expect(computeBalance({ carries: true, entitlement: vacation, fiscalYear: 2570, appointedOn: '2020-01-01', opening: { carriedDays: 7, usedDays: 3 }, approvedDays: 2, cancelledDays: 1, pendingDays: 1, previousYearRemaining: 18 }))
      .toEqual({ entitled: 10, carried: 7, used: 4, pending: 1, remaining: 12 });
  });

  it('does not carry other types', () => {
    expect(computeBalance({ ...base, carries: false, entitlement: vacation, fiscalYear: 2570, appointedOn: '2010-01-01', previousYearRemaining: 30 }).carried).toBe(0);
  });
});

describe('serviceMonths', () => {
  it('counts whole months of service', () => {
    expect(serviceMonths('2026-04-30', '2026-10-29')).toBe(5);
    expect(serviceMonths('2026-04-30', '2026-10-30')).toBe(6);
    expect(serviceMonths('2026-01-31', '2026-02-28')).toBe(1);
    expect(serviceMonths('2026-10-01', '2026-09-30')).toBe(0);
  });
});
