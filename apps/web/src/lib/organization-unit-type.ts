import type { OrganizationUnitType } from '@backoffice/contracts';

export const unitTypeLabelKeys = { SECTION: 'hrUnitTypeSection', DIVISION: 'hrUnitTypeDivision', HOSPITAL: 'hrUnitTypeHospital' } as const;

const headKeys = { head: 'hrOrganizationHead', none: 'hrNoHead', inactive: 'hrHeadInactive', newHead: 'hrNewHead', startDate: 'hrHeadStartDate', assign: 'hrAssignHead', history: 'hrHeadHistory', noHistory: 'hrNoHeadHistory' } as const;
const directorKeys = { head: 'hrDirector', none: 'hrNoDirector', inactive: 'hrDirectorInactive', newHead: 'hrNewDirector', startDate: 'hrDirectorStartDate', assign: 'hrAssignDirector', history: 'hrDirectorHistory', noHistory: 'hrNoDirectorHistory' } as const;

/** The head of a hospital unit is its director (ผู้อำนวยการ); every other unit has a หัวหน้า. */
export function headLabelKeys(unitType: OrganizationUnitType | null | undefined): typeof headKeys | typeof directorKeys {
  return unitType === 'HOSPITAL' ? directorKeys : headKeys;
}
