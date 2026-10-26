import { t, type MessageKey } from '@backoffice/i18n';

const typeKeys: Record<string, MessageKey> = { IN_PROVINCE: 'travelTypeInProvince', OUT_OF_PROVINCE: 'travelTypeOutOfProvince', ABROAD: 'travelTypeAbroad' };
const vehicleKeys: Record<string, MessageKey> = { GOVERNMENT_CAR: 'travelVehicleGovernmentCar', PRIVATE_CAR: 'travelVehiclePrivateCar', PUBLIC_TRANSPORT: 'travelVehiclePublicTransport', AIRPLANE: 'travelVehicleAirplane', WITH_ORGANISER: 'travelVehicleWithOrganiser' };
const fundingKeys: Record<string, MessageKey> = { HOSPITAL_FUND: 'travelFundingHospital', ORGANISER: 'travelFundingOrganiser', NONE: 'travelFundingNone' };
const errorKeys: Record<string, MessageKey> = {
  NO_TRAVEL_DAYS: 'travelErrorNoDays', INVALID_MEMBERS: 'travelErrorInvalidMembers', NO_ORGANIZATION: 'travelErrorNoOrganization', NO_APPROVER: 'travelErrorNoApprover', OVERLAPS_LEAVE: 'travelErrorOverlapsLeave', OVERLAPS_TRAVEL: 'travelErrorOverlapsTravel',
  NOT_FOUND: 'travelErrorNotFound', NOT_RETURNED: 'travelErrorNotReturned', NOT_PENDING: 'travelErrorNotPending', invalid_input: 'leaveErrorInvalid',
  CONFLICT_OF_INTEREST: 'leaveErrorConflict', APPROVER_REQUIRED: 'leaveErrorApproverRequired', REQUEST_NOT_PENDING: 'leaveErrorRequestNotPending'
};
const bahtFormatter = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const TRAVEL_TYPES = ['IN_PROVINCE', 'OUT_OF_PROVINCE', 'ABROAD'] as const;
export const TRAVEL_VEHICLES = ['GOVERNMENT_CAR', 'PRIVATE_CAR', 'PUBLIC_TRANSPORT', 'AIRPLANE', 'WITH_ORGANISER'] as const;
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
