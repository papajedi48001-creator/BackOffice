import type { TravelReportStatus } from '@backoffice/core';
import { t, type MessageKey } from '@backoffice/i18n';
import { formatThaiDateInput } from './thai-date-input';

const typeKeys: Record<string, MessageKey> = { IN_PROVINCE: 'travelTypeInProvince', OUT_OF_PROVINCE: 'travelTypeOutOfProvince', ABROAD: 'travelTypeAbroad' };
const vehicleKeys: Record<string, MessageKey> = { GOVERNMENT_CAR: 'travelVehicleGovernmentCar', PRIVATE_CAR: 'travelVehiclePrivateCar', PUBLIC_TRANSPORT: 'travelVehiclePublicTransport', AIRPLANE: 'travelVehicleAirplane', PRIVATE_CAR_AIRPLANE: 'travelVehiclePrivateCarAirplane', GOVERNMENT_CAR_AIRPLANE: 'travelVehicleGovernmentCarAirplane', WITH_ORGANISER: 'travelVehicleWithOrganiser' };
const fundingKeys: Record<string, MessageKey> = { HOSPITAL_FUND: 'travelFundingHospital', ORGANISER: 'travelFundingOrganiser', NONE: 'travelFundingNone', MIXED: 'travelFundingMixed' };
const errorKeys: Record<string, MessageKey> = {
  NO_TRAVEL_DAYS: 'travelErrorNoDays', INVALID_MEMBERS: 'travelErrorInvalidMembers', NO_ORGANIZATION: 'travelErrorNoOrganization', NO_APPROVER: 'travelErrorNoApprover', OVERLAPS_LEAVE: 'travelErrorOverlapsLeave', OVERLAPS_TRAVEL: 'travelErrorOverlapsTravel',
  NOT_FOUND: 'travelErrorNotFound', NOT_RETURNED: 'travelErrorNotReturned', NOT_PENDING: 'travelErrorNotPending', REPORT_NOT_DUE: 'travelErrorReportNotDue', invalid_input: 'leaveErrorInvalid', INVALID_ATTACHMENT: 'attachmentErrorInvalid',
  CONFLICT_OF_INTEREST: 'leaveErrorConflict', APPROVER_REQUIRED: 'leaveErrorApproverRequired', REQUEST_NOT_PENDING: 'leaveErrorRequestNotPending'
};
const bahtFormatter = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const TRAVEL_TYPES = ['IN_PROVINCE', 'OUT_OF_PROVINCE', 'ABROAD'] as const;
export const TRAVEL_VEHICLES = ['GOVERNMENT_CAR', 'PRIVATE_CAR', 'PUBLIC_TRANSPORT', 'AIRPLANE', 'PRIVATE_CAR_AIRPLANE', 'GOVERNMENT_CAR_AIRPLANE', 'WITH_ORGANISER'] as const;
export const TRAVEL_FUNDING = ['HOSPITAL_FUND', 'ORGANISER', 'NONE'] as const;

export const travelTypeLabel = (code: string) => (typeKeys[code] ? t(typeKeys[code]) : code);
export const travelVehicleLabel = (code: string) => (vehicleKeys[code] ? t(vehicleKeys[code]) : code);
export const travelFundingLabel = (code: string) => (fundingKeys[code] ? t(fundingKeys[code]) : code);
/** `1,240.00` */
export const formatBaht = (amount: number) => bahtFormatter.format(amount);
/** Thai text for a travel error code; a failure about one person is prefixed with their name. */
export function travelErrorMessage(code: string | null | undefined, personName?: string | null): string {
  const message = t(code && errorKeys[code] ? errorKeys[code] : 'leaveErrorFailed');
  return personName ? `${personName}: ${message}` : message;
}

const reportStatusKeys = { SUBMITTED: 'travelReportSubmitted', MISSING: 'travelReportMissing', NOT_DUE: 'travelReportNotDue' } as const;
export const travelReportStatusLabel = (status: TravelReportStatus) => (status === 'NONE' ? '—' : t(reportStatusKeys[status]));

/** Each cost item with its label key, in the order the form and the print show them. */
export const TRAVEL_COST_ITEMS = [['allowance', 'travelCostAllowance'], ['lodging', 'travelCostLodging'], ['transport', 'travelCostTransport'], ['registration', 'travelCostRegistration']] as const;
export type TravelCostItem = (typeof TRAVEL_COST_ITEMS)[number][0];
/** `ค่าที่พัก` from `ค่าที่พัก (บาท)`. */
export const costItemName = (key: MessageKey) => t(key).replace(/ \(บาท\)$/, '');
/** `เบี้ยเลี้ยง 240.00 (เงินบำรุง) · ค่าลงทะเบียน 1,000.00 (งบผู้จัด)`: only the items that cost something. */
export function formatCostItems(costs: Record<TravelCostItem, number>, funding: Record<TravelCostItem, string>): string {
  return TRAVEL_COST_ITEMS.filter(([item]) => costs[item] > 0).map(([item, key]) => `${costItemName(key)} ${formatBaht(costs[item])} (${travelFundingLabel(funding[item])})`).join(' · ') || '—';
}
/** `มค 0033/ว 123 ลงวันที่ 30 ต.ค. 2569 · สสจ.มหาสารคาม`, leaving out what was not given. */
export function formatInvitation(invitation: { number: string | null; date: string | null; issuer: string | null } | null): string {
  if (!invitation) return '—';
  const head = [invitation.number, invitation.date ? `${t('travelInvitationDate')} ${formatThaiDateInput(invitation.date)}` : null].filter(Boolean).join(' ');
  return [head, invitation.issuer].filter(Boolean).join(' · ') || '—';
}
