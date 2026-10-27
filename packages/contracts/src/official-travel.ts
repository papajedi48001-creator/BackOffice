import { z } from 'zod';
import { commandChainTargetSchema } from './hr.ts';
import { attachmentIdSchema, rangeShape, withRangeChecks } from './leave.ts';

export const travelTypeCodeSchema = z.enum(['IN_PROVINCE', 'OUT_OF_PROVINCE', 'ABROAD']);
export type TravelTypeCode = z.infer<typeof travelTypeCodeSchema>;
export const travelVehicleSchema = z.enum(['GOVERNMENT_CAR', 'PRIVATE_CAR', 'PUBLIC_TRANSPORT', 'AIRPLANE', 'WITH_ORGANISER']);
export type TravelVehicle = z.infer<typeof travelVehicleSchema>;
export const travelFundingSchema = z.enum(['HOSPITAL_FUND', 'ORGANISER', 'NONE']);
export type TravelFunding = z.infer<typeof travelFundingSchema>;

const text = (max: number) => z.string().trim().min(1).max(max);
const cost = z.number().min(0).max(9_999_999.99).refine((value) => Math.abs(Math.round(value * 100) - value * 100) < 1e-6, { message: 'SATANG' }).default(0);
/** A คำขอไปราชการ as filed. The หัวหน้าคณะ is the session's person and never comes from the body; `memberPersonIds` are the others going. */
export const officialTravelInputSchema = withRangeChecks(z.object({
  ...rangeShape,
  subject: text(300), organiser: text(300), place: text(300), province: text(100),
  travelType: travelTypeCodeSchema, vehicle: travelVehicleSchema, fundingSource: travelFundingSchema,
  costAllowance: cost, costLodging: cost, costTransport: cost, costRegistration: cost,
  attachmentId: attachmentIdSchema.nullable().optional(),
  memberPersonIds: z.array(z.string().min(1)).max(29).refine((ids) => new Set(ids).size === ids.length, { message: 'DUPLICATE_MEMBER' }).default([])
}).strict()).refine((trip) => Date.parse(`${trip.endDate}T00:00:00Z`) - Date.parse(`${trip.startDate}T00:00:00Z`) <= 365 * 86_400_000, { message: 'TOO_LONG', path: ['endDate'] });
export type OfficialTravelInput = z.infer<typeof officialTravelInputSchema>;
export const travelTypeSettingInputSchema = z.object({ approvalTarget: commandChainTargetSchema }).strict();
export type TravelTypeSettingInput = z.infer<typeof travelTypeSettingInputSchema>;

export const travelReportInputSchema = z.object({ summary: z.string().trim().min(1).max(5000), application: z.string().trim().min(1).max(5000) }).strict();
export type TravelReportInput = z.infer<typeof travelReportInputSchema>;

export type OfficialTravelErrorCode = 'INVALID_ATTACHMENT' | 'REPORT_NOT_DUE' | 'NO_TRAVEL_DAYS' | 'INVALID_MEMBERS' | 'NO_ORGANIZATION' | 'NO_APPROVER' | 'OVERLAPS_LEAVE' | 'OVERLAPS_TRAVEL' | 'NOT_FOUND' | 'NOT_RETURNED' | 'NOT_PENDING';
