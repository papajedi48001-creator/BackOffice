import type { MciCommandRole, MciGender, MciIncidentKind, MciIncidentStatus } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { buildPublicBoard, type MciIncidentRow, type MciPatientRow, type PublicBoard } from './mci-public-board';
import { MciSettingsQueries } from './mci-settings-queries';

export type { MciIncidentRow, MciPatientRow, PublicBoard };
export interface MciIncidentListItem extends MciIncidentRow { patients: number; responders: number }
export interface MciResponderRow { id: string; personId: string; displayName: string | null; professionId: string | null; professionName: string | null; zoneId: string | null; zoneName: string | null; commandRole: MciCommandRole; checkedInAt: string; checkedOutAt: string | null }

const instant = (column: string) => `DATE_FORMAT(${column}, '%Y-%m-%dT%H:%i:%s.000Z')`;
const INCIDENT = `SELECT i.id, i.title, i.kind, i.status, i.location, ${instant('i.occurred_at')} AS occurredAt, ${instant('i.opened_at')} AS openedAt, ${instant('i.closed_at')} AS closedAt, ${instant('COALESCE(i.updated_at, i.opened_at)')} AS updatedAt FROM mci_incident i`;
const PATIENT = `SELECT p.id, p.tag_no AS tagNo, p.triage_level_id AS triageLevelId, p.status_id AS statusId, p.zone_id AS zoneId, p.destination_hospital AS destinationHospital, p.first_name AS firstName, p.last_name AS lastName, p.gender, p.age_estimate AS ageEstimate, p.hn, p.public_hidden AS publicHidden, ${instant('p.updated_at')} AS updatedAt FROM mci_patient p`;
const RESPONDER = `SELECT r.id, r.person_id AS personId, pe.display_name AS displayName, r.profession_id AS professionId, pr.name AS professionName, r.zone_id AS zoneId, z.name AS zoneName, r.command_role AS commandRole, ${instant('r.checked_in_at')} AS checkedInAt, ${instant('r.checked_out_at')} AS checkedOutAt FROM mci_responder r JOIN person pe ON pe.id = r.person_id LEFT JOIN mci_profession pr ON pr.id = r.profession_id LEFT JOIN mci_zone z ON z.id = r.zone_id`;

type RawIncident = Omit<MciIncidentRow, 'kind' | 'status'> & { kind: string; status: string };
type RawPatient = Omit<MciPatientRow, 'publicHidden' | 'gender'> & { publicHidden: number; gender: string };
const incidentOf = (row: RawIncident): MciIncidentRow => ({ ...row, kind: row.kind as MciIncidentKind, status: row.status as MciIncidentStatus, closedAt: row.closedAt ?? null });
const patientOf = (row: RawPatient): MciPatientRow => ({ ...row, tagNo: Number(row.tagNo), ageEstimate: row.ageEstimate === null ? null : Number(row.ageEstimate), gender: row.gender as MciGender, publicHidden: Number(row.publicHidden) === 1 });
const responderOf = (row: MciResponderRow): MciResponderRow => ({ ...row, zoneId: row.zoneId ?? null, professionId: row.professionId ?? null, checkedOutAt: row.checkedOutAt ?? null });

/** Reads for อุบัติเหตุหมู่ pages. Pages check access first; `publicBoard` is the only read meant for anyone. */
export class MciQueries {
  constructor(private readonly database: Pick<Database, 'query'>) {}

  async openIncident(): Promise<MciIncidentRow | null> {
    const [row] = await this.database.query<RawIncident>(`${INCIDENT} WHERE i.status = 'OPEN' LIMIT 1`);
    return row ? incidentOf(row) : null;
  }

  async incident(id: string): Promise<MciIncidentRow | null> {
    const [row] = await this.database.query<RawIncident>(`${INCIDENT} WHERE i.id = ?`, [id]);
    return row ? incidentOf(row) : null;
  }

  async incidents(): Promise<MciIncidentListItem[]> {
    const rows = await this.database.query<RawIncident & { patients: number; responders: number }>(`SELECT x.*, (SELECT COUNT(*) FROM mci_patient p WHERE p.incident_id = x.id) AS patients, (SELECT COUNT(DISTINCT r.person_id) FROM mci_responder r WHERE r.incident_id = x.id) AS responders FROM (${INCIDENT}) x ORDER BY x.openedAt DESC LIMIT 200`);
    return rows.map((row) => ({ ...incidentOf(row), patients: Number(row.patients), responders: Number(row.responders) }));
  }

  async myResponder(incidentId: string, personId: string): Promise<MciResponderRow | null> {
    const [row] = await this.database.query<MciResponderRow>(`${RESPONDER} WHERE r.incident_id = ? AND r.person_id = ? AND r.checked_out_at IS NULL LIMIT 1`, [incidentId, personId]);
    return row ? responderOf(row) : null;
  }

  async responders(incidentId: string, { activeOnly = true } = {}): Promise<MciResponderRow[]> {
    const rows = await this.database.query<MciResponderRow>(`${RESPONDER} WHERE r.incident_id = ?${activeOnly ? ' AND r.checked_out_at IS NULL' : ''} ORDER BY z.sort_order IS NULL, z.sort_order, pr.sort_order, pe.display_name, r.checked_in_at`, [incidentId]);
    return rows.map(responderOf);
  }

  async responder(id: string): Promise<(MciResponderRow & { incidentId: string }) | null> {
    const [row] = await this.database.query<MciResponderRow & { incidentId: string }>(`${RESPONDER.replace('SELECT r.id,', 'SELECT r.id, r.incident_id AS incidentId,')} WHERE r.id = ?`, [id]);
    return row ? { ...responderOf(row), incidentId: row.incidentId } : null;
  }

  async patients(incidentId: string): Promise<MciPatientRow[]> {
    return (await this.database.query<RawPatient>(`${PATIENT} WHERE p.incident_id = ? ORDER BY p.tag_no`, [incidentId])).map(patientOf);
  }

  async patient(id: string): Promise<(MciPatientRow & { incidentId: string }) | null> {
    const [row] = await this.database.query<RawPatient & { incidentId: string }>(`${PATIENT.replace('SELECT p.id,', 'SELECT p.id, p.incident_id AS incidentId,')} WHERE p.id = ?`, [id]);
    return row ? { ...patientOf(row), incidentId: row.incidentId } : null;
  }

  /** The open เหตุ's กระดานสาธารณะ, or an empty board with the contact phone. */
  async publicBoard(): Promise<PublicBoard> {
    const [incident, settings] = await Promise.all([this.openIncident(), new MciSettingsQueries(this.database).settings()]);
    return buildPublicBoard(incident, incident ? await this.patients(incident.id) : [], settings);
  }
}
