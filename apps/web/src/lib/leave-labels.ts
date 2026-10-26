import type { LeaveWarning } from '@backoffice/contracts';
import { t, type MessageKey } from '@backoffice/i18n';
import { formatBangkokDate } from './bangkok-time';

const statusKeys: Record<string, MessageKey> = { IN_REVIEW: 'leaveStatusInReview', APPROVED: 'leaveStatusApproved', RETURNED: 'leaveStatusReturned', REJECTED: 'leaveStatusRejected', CANCELLED: 'leaveStatusCancelled' };
const stepKeys: Record<string, MessageKey> = { PENDING: 'leaveStepPending', APPROVED: 'leaveStepApproved', RETURNED: 'leaveStepReturned', REJECTED: 'leaveStepRejected', CANCELLED: 'leaveStepCancelled' };
const errorKeys: Record<string, MessageKey> = {
  NO_LEAVE_DAYS: 'leaveErrorNoLeaveDays', CROSSES_FISCAL_YEAR: 'leaveErrorCrossesFiscalYear', INACTIVE_LEAVE_TYPE: 'leaveErrorInactiveType', NO_ENTITLEMENT: 'leaveErrorNoEntitlement',
  SERVICE_TOO_SHORT: 'leaveErrorServiceTooShort', APPOINTMENT_DATE_MISSING: 'leaveErrorAppointmentMissing', INSUFFICIENT_BALANCE: 'leaveErrorInsufficientBalance', OVERLAPS_EXISTING_LEAVE: 'leaveErrorOverlaps',
  NO_ORGANIZATION: 'leaveErrorNoOrganization', NO_APPROVER: 'leaveErrorNoApprover', NOT_FOUND: 'leaveErrorNotFound', NOT_APPROVED: 'leaveErrorNotApproved', NOT_RETURNED: 'leaveErrorNotReturned',
  OUTSIDE_LEAVE: 'leaveErrorOutside', OVERLAPS_CANCELLATION: 'leaveErrorOverlapsCancellation', NOT_PENDING: 'leaveErrorNotPending', invalid_input: 'leaveErrorInvalid',
  DUPLICATE_CODE: 'leaveErrorDuplicate', DUPLICATE_NAME: 'leaveErrorDuplicate', DUPLICATE_DATE: 'leaveErrorDuplicateDate',
  CONFLICT_OF_INTEREST: 'leaveErrorConflict', APPROVER_REQUIRED: 'leaveErrorApproverRequired', REQUEST_NOT_PENDING: 'leaveErrorRequestNotPending',
  MISSING_COLUMN: 'leaveCsvMissingColumn', UNKNOWN_EMPLOYEE: 'leaveCsvUnknownEmployee', UNKNOWN_LEAVE_TYPE: 'leaveCsvUnknownLeaveType', INVALID_NUMBER: 'leaveCsvInvalidNumber', DUPLICATE_ROW: 'leaveCsvDuplicateRow',
  invalid_csv: 'leaveCsvInvalid', file_too_large: 'leaveFileTooLarge'
};
const monthFormatter = new Intl.DateTimeFormat('th-TH', { timeZone: 'UTC', month: 'long', year: 'numeric' });

export const leaveStatusLabel = (status: string) => (statusKeys[status] ? t(statusKeys[status]) : status);
export const leaveStepLabel = (status: string) => (stepKeys[status] ? t(stepKeys[status]) : status);
/** Thai text for a leave error code from the API; unknown codes get the generic failure. */
export const leaveErrorMessage = (code: string | null | undefined) => t(code && errorKeys[code] ? errorKeys[code] : 'leaveErrorFailed');
export const leaveKindLabel = (kind: 'LEAVE' | 'CANCEL_DAYS') => t(kind === 'LEAVE' ? 'leaveRequest' : 'leaveCancelDays');
export const leaveCountingLabel = (counting: string) => t(counting === 'CALENDAR_DAYS' ? 'leaveCountingCalendar' : 'leaveCountingWorking');
export const leaveDaysLabel = (days: number, counting: string) => `${days} ${t(counting === 'CALENDAR_DAYS' ? 'leaveDayUnit' : 'leaveWorkingDayUnit')}`;
export const leaveTargetLabel = (target: string) => t(({ SECTION: 'leaveTargetSection', DIVISION: 'leaveTargetDivision', HOSPITAL: 'leaveTargetHospital', NEAREST_HEAD: 'leaveTargetNearest' } as Record<string, MessageKey>)[target] ?? 'leaveTargetHospital');
/** `2026-11` → `พฤศจิกายน 2569`. */
export const formatLeaveMonth = (month: string) => monthFormatter.format(new Date(`${month}-01T00:00:00Z`));

/** `5 พ.ย. 2569 (ครึ่งวันบ่าย) – 6 พ.ย. 2569`; half days are named only where they apply. */
export function formatLeaveRange(range: { startDate: string; endDate: string; startHalf: string; endHalf: string }): string {
  const start = `${formatBangkokDate(range.startDate)}${range.startHalf === 'AFTERNOON' ? ` (${t('leaveHalfAfternoon')})` : ''}`;
  if (range.startDate === range.endDate) return range.endHalf === 'MORNING' ? `${start} (${t('leaveHalfMorning')})` : start;
  return `${start} – ${formatBangkokDate(range.endDate)}${range.endHalf === 'MORNING' ? ` (${t('leaveHalfMorning')})` : ''}`;
}

/** `เดือน พฤศจิกายน 2569 จะเหลือวันทำการ 14 วัน ต่ำกว่าขั้นต่ำ 15 วัน`. */
export function leaveWarningText(warning: LeaveWarning): string {
  return `${t('leaveWarningPrefix')} ${formatLeaveMonth(warning.month)} ${t('leaveWarningMiddle')} ${warning.workingDays} ${t('leaveWarningSuffix')} ${warning.minimum} ${t('leaveDayUnit')}`;
}
