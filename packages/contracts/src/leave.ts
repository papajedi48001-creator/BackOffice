import { z } from 'zod';
import { calendarDateSchema, commandChainTargetSchema, genderSchema } from './hr.ts';

export const leaveCountingSchema = z.enum(['WORKING_DAYS', 'CALENDAR_DAYS']);
export type LeaveCounting = z.infer<typeof leaveCountingSchema>;
export const leaveStartHalfSchema = z.enum(['FULL', 'AFTERNOON']);
export type LeaveStartHalf = z.infer<typeof leaveStartHalfSchema>;
export const leaveEndHalfSchema = z.enum(['FULL', 'MORNING']);
export type LeaveEndHalf = z.infer<typeof leaveEndHalfSchema>;
export interface DayRange { startDate: string; endDate: string; startHalf: LeaveStartHalf; endHalf: LeaveEndHalf }

export const rangeShape = { startDate: calendarDateSchema, endDate: calendarDateSchema, startHalf: leaveStartHalfSchema.default('FULL'), endHalf: leaveEndHalfSchema.default('FULL') };
type RangeLike = { startDate: string; endDate: string; startHalf: LeaveStartHalf; endHalf: LeaveEndHalf };
/** A start after the end, or one day that is both afternoon-only and morning-only, holds no time at all. */
export const withRangeChecks = <T extends z.ZodType<RangeLike>>(schema: T) => schema
  .refine((range) => range.endDate >= range.startDate, { message: 'END_BEFORE_START', path: ['endDate'] })
  .refine((range) => !(range.startDate === range.endDate && range.startHalf === 'AFTERNOON' && range.endHalf === 'MORNING'), { message: 'EMPTY_DAY', path: ['endHalf'] });

/** A ไฟล์แนบส่วนตัว the same person uploaded; null on an edit removes the file, left out keeps it. */
export const attachmentIdSchema = z.string().uuid();

export const leaveRangeSchema = withRangeChecks(z.object(rangeShape).strict());
const reasonSchema = z.string().trim().min(1).max(1000);
/** The person filing always comes from the session, never from the body. Reasons never leave the leave tables. */
export const leaveRequestInputSchema = withRangeChecks(z.object({ ...rangeShape, leaveTypeId: z.string().min(1), reason: reasonSchema, contactDuringLeave: z.string().trim().max(500).nullable().optional(), attachmentId: attachmentIdSchema.nullable().optional() }).strict());
export type LeaveRequestInput = z.infer<typeof leaveRequestInputSchema>;
export const leaveCancelDaysInputSchema = withRangeChecks(z.object({ ...rangeShape, reason: reasonSchema }).strict());
export type LeaveCancelDaysInput = z.infer<typeof leaveCancelDaysInputSchema>;
export const leaveBulkApproveInputSchema = z.object({ requestIds: z.array(z.string().min(1)).min(1).max(100) }).strict();

const halfDays = (max: number) => z.number().min(0).max(max).multipleOf(0.5);
export const leaveTypeInputSchema = z.object({
  name: z.string().trim().min(1).max(120), counting: leaveCountingSchema, approvalTarget: commandChainTargetSchema,
  attachmentRequiredFromDays: z.number().positive().multipleOf(0.5).nullable(), isActive: z.boolean(), sortOrder: z.number().int(),
  /** Only this gender may take the type (ลาคลอดบุตร, ลาไปช่วยภริยาคลอดบุตร); null for everyone. Left out on an update, it stays as stored. */
  eligibleGender: genderSchema.nullable().optional()
}).strict();
export type LeaveTypeInput = z.infer<typeof leaveTypeInputSchema>;
export const leaveTypeCreateInputSchema = leaveTypeInputSchema.extend({ code: z.string().regex(/^[A-Z][A-Z0-9_]{1,31}$/) }).strict();
export type LeaveTypeCreateInput = z.infer<typeof leaveTypeCreateInputSchema>;
export const leaveEntitlementInputSchema = z.object({
  employmentTypeId: z.string().min(1), leaveTypeId: z.string().min(1), daysPerYear: halfDays(365), firstYearDays: halfDays(365).nullable(),
  maxAccumulatedDays: halfDays(365).nullable(), maxAccumulatedDaysAfter10Years: halfDays(365).nullable(), minServiceMonths: z.number().int().min(0).max(600)
}).strict();
export type LeaveEntitlementInput = z.infer<typeof leaveEntitlementInputSchema>;
export const leaveHolidayInputSchema = z.object({ date: calendarDateSchema, name: z.string().trim().min(1).max(120) }).strict();
export type LeaveHolidayInput = z.infer<typeof leaveHolidayInputSchema>;
export const leaveSettingInputSchema = z.object({ minWorkingDaysPerMonth: z.number().int().min(0).max(31) }).strict();
export type LeaveSettingInput = z.infer<typeof leaveSettingInputSchema>;

export interface LeaveBalance { entitled: number; carried: number; used: number; pending: number; remaining: number }
export interface LeaveWarning { month: string; workingDays: number; minimum: number }
export type LeaveErrorCode = 'NO_LEAVE_DAYS' | 'CROSSES_FISCAL_YEAR' | 'INACTIVE_LEAVE_TYPE' | 'NO_ENTITLEMENT' | 'NOT_ELIGIBLE' | 'SERVICE_TOO_SHORT' | 'APPOINTMENT_DATE_MISSING' | 'INSUFFICIENT_BALANCE' | 'OVERLAPS_EXISTING_LEAVE' | 'NO_ORGANIZATION' | 'NO_APPROVER' | 'NOT_FOUND' | 'NOT_APPROVED' | 'NOT_RETURNED' | 'OUTSIDE_LEAVE' | 'OVERLAPS_CANCELLATION' | 'OVERLAPS_OFFICIAL_TRAVEL';
