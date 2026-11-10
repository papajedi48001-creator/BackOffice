import type { MciGender, MciIncidentKind, MciIncidentStatus } from '@backoffice/contracts';
import { publicName } from './mci-rules';
import type { MciSettings } from './mci-settings-queries';

export interface MciIncidentRow { id: string; title: string; kind: MciIncidentKind; status: MciIncidentStatus; location: string; occurredAt: string; openedAt: string; closedAt: string | null; updatedAt: string }
export interface MciPatientRow { id: string; tagNo: number; triageLevelId: string; statusId: string; zoneId: string; destinationHospital: string; firstName: string; lastName: string; gender: MciGender; ageEstimate: number | null; hn: string; publicHidden: boolean; updatedAt: string }

/** What a relative sees in place of where a deceased or hidden casualty is: staff tell the family in person. */
export const CONTACT_PLACE = 'กรุณาติดต่อจุดประชาสัมพันธ์';

export interface PublicBoard {
  incident: { title: string; kind: MciIncidentKind; occurredAt: string } | null;
  updatedAt: string | null;
  total: number;
  byTriage: { name: string; colorHex: string; count: number }[];
  byStatus: { name: string; count: number }[];
  people: { name: string; place: string }[];
  contactPhone: string;
}

/**
 * กระดานสาธารณะ: built from scratch with only what may leave the hospital. No tag, colour, HN, age, gender or full surname
 * per person; the deceased and anyone the ผู้บัญชาการ hid show the contact text instead of a place.
 */
export function buildPublicBoard(incident: MciIncidentRow | null, patients: readonly MciPatientRow[], settings: MciSettings): PublicBoard {
  const count = <K extends keyof MciPatientRow>(key: K, value: MciPatientRow[K]) => patients.filter((patient) => patient[key] === value).length;
  const statusOf = new Map(settings.statuses.map((status) => [status.id, status]));
  const zoneOf = new Map(settings.zones.map((zone) => [zone.id, zone.name]));
  const people = patients.flatMap((patient) => {
    const name = publicName(patient.firstName, patient.lastName);
    if (!name) return [];
    const status = statusOf.get(patient.statusId);
    const place = patient.publicHidden || status?.isDeceased ? CONTACT_PLACE
      : status?.needsDestination ? `ส่งต่อ ${patient.destinationHospital}`.trim()
      : status?.isDischarged ? 'กลับบ้านแล้ว'
      : zoneOf.get(patient.zoneId) ?? CONTACT_PLACE;
    return [{ name, place }];
  }).sort((a, b) => a.name.localeCompare(b.name, 'th'));
  return {
    incident: incident ? { title: incident.title, kind: incident.kind, occurredAt: incident.occurredAt } : null,
    updatedAt: incident?.updatedAt ?? null,
    total: patients.length,
    byTriage: settings.triageLevels.map((level) => ({ level, count: count('triageLevelId', level.id) })).filter(({ level, count: n }) => level.isActive || n > 0).map(({ level, count: n }) => ({ name: level.name, colorHex: level.colorHex, count: n })),
    byStatus: settings.statuses.filter((status) => !status.isDeceased).map((status) => ({ status, count: count('statusId', status.id) })).filter(({ status, count: n }) => status.isActive || n > 0).map(({ status, count: n }) => ({ name: status.name, count: n })),
    people,
    contactPhone: settings.publicContactPhone
  };
}
