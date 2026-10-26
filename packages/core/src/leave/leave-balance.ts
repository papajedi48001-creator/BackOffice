import type { LeaveBalance } from '@backoffice/contracts';
import { fiscalYearRange } from './leave-days';

/** สิทธิ์การลา of one ประเภทการจ้าง for one ประเภทการลา. */
export interface Entitlement { daysPerYear: number; firstYearDays: number | null; maxAccumulatedDays: number | null; maxAccumulatedDaysAfter10Years: number | null; minServiceMonths: number }

const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** Whole months between วันบรรจุ and a date; a month counts once its day is reached (or the month ends first). */
export function serviceMonths(appointedOn: string, on: string): number {
  const [fromYear, fromMonth, fromDay] = appointedOn.split('-').map(Number) as [number, number, number];
  const [toYear, toMonth, toDay] = on.split('-').map(Number) as [number, number, number];
  let months = (toYear - fromYear) * 12 + (toMonth - fromMonth);
  if (toDay < Math.min(fromDay, daysInMonth(toYear, toMonth))) months -= 1;
  return Math.max(months, 0);
}

export function computeBalance(input: {
  carries: boolean; entitlement: Entitlement; fiscalYear: number; appointedOn: string | null;
  opening: { carriedDays: number; usedDays: number } | null; approvedDays: number; cancelledDays: number; pendingDays: number; previousYearRemaining: number | null;
}): LeaveBalance {
  const { entitlement } = input;
  const year = fiscalYearRange(input.fiscalYear);
  const firstYear = input.appointedOn !== null && input.appointedOn >= year.start && input.appointedOn <= year.end;
  const entitled = firstYear && entitlement.firstYearDays !== null ? entitlement.firstYearDays : entitlement.daysPerYear;
  let carried = 0;
  if (input.opening) carried = input.opening.carriedDays;
  else if (input.carries) {
    const tenYears = input.appointedOn !== null && serviceMonths(input.appointedOn, year.start) >= 120;
    const cap = (tenYears ? entitlement.maxAccumulatedDaysAfter10Years : null) ?? entitlement.maxAccumulatedDays;
    carried = cap === null ? 0 : Math.max(Math.min(Math.max(input.previousYearRemaining ?? 0, 0), cap - entitlement.daysPerYear), 0);
  }
  const used = (input.opening?.usedDays ?? 0) + input.approvedDays - input.cancelledDays;
  return { entitled, carried, used, pending: input.pendingDays, remaining: entitled + carried - used - input.pendingDays };
}
