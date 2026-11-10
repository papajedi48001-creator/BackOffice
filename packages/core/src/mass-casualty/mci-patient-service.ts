import { randomUUID } from 'node:crypto';
import { mciNewPatientInputSchema, mciPatientInputSchema, type AccessSubject, type MciNewPatientInput, type MciPatientInput } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { canCommandMci, mciCan } from './mci-access';
import { loadActor } from './mci-actor';
import { mciAudit } from './mci-db';
import { MciSettingsQueries } from './mci-settings-queries';
import { formatTag, reconcileDeceased } from './mci-rules';

type CreateResult = { ok: true; patientId: string; tag: string } | { ok: false; code: 'NO_OPEN_INCIDENT' | 'FORBIDDEN' | 'NOT_FOUND' };
type UpdateResult = { ok: true } | { ok: false; code: 'NOT_FOUND' | 'FORBIDDEN' | 'INCIDENT_CLOSED' | 'DESTINATION_REQUIRED' | 'TRIAGE_REQUIRED' };

/** ผู้ป่วยในเหตุ: เลขป้าย from the เหตุ's sequence, colour and status kept consistent, names never in audit metadata. */
export class MciPatientService {
  constructor(private readonly database: Database, private readonly createId: () => string = randomUUID) {}

  async create(subject: AccessSubject, input: MciNewPatientInput): Promise<CreateResult> {
    const patient = mciNewPatientInputSchema.parse(input);
    const settings = await new MciSettingsQueries(this.database).settings();
    if (!settings.triageLevels.some((level) => level.id === patient.triageLevelId && level.isActive) || !settings.zones.some((zone) => zone.id === patient.zoneId && zone.isActive)) return { ok: false, code: 'NOT_FOUND' };
    const status = reconcileDeceased({ triageLevelId: patient.triageLevelId, statusId: settings.intakeStatusId }, null, settings);
    if (!status.ok) return { ok: false, code: 'NOT_FOUND' };
    return this.database.transaction(async (database) => {
      // Locking the เหตุ row serialises its sequence, so two ผู้บันทึก never get the same เลขป้าย.
      const [incident] = await database.query<{ id: string; seq: number }>("SELECT id, patient_seq AS seq FROM mci_incident WHERE status = 'OPEN' LIMIT 1 FOR UPDATE");
      if (!incident) return { ok: false as const, code: 'NO_OPEN_INCIDENT' as const };
      const actor = await loadActor(database, incident.id, subject.personId!);
      if (!mciCan(actor, canCommandMci(subject), 'record', patient.zoneId)) return { ok: false as const, code: 'FORBIDDEN' as const };
      const tagNo = Number(incident.seq) + 1;
      const patientId = this.createId();
      await database.execute('UPDATE mci_incident SET patient_seq = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?', [tagNo, incident.id]);
      await database.execute('INSERT INTO mci_patient (id, incident_id, tag_no, triage_level_id, status_id, zone_id, first_name, last_name, gender, age_estimate, hn, created_by, created_at, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), ?, UTC_TIMESTAMP())', [patientId, incident.id, tagNo, status.triageLevelId, status.statusId, patient.zoneId, patient.firstName, patient.lastName, patient.gender, patient.ageEstimate, patient.hn, subject.personId!, subject.personId!]);
      const tag = formatTag(tagNo);
      await mciAudit(database, this.createId, subject.personId!, 'mci.patient.create', 'mci_patient', patientId, { incidentId: incident.id, tag, triageLevelId: status.triageLevelId, zoneId: patient.zoneId });
      return { ok: true as const, patientId, tag };
    });
  }

  async update(subject: AccessSubject, patientId: string, input: MciPatientInput): Promise<UpdateResult> {
    const patient = mciPatientInputSchema.parse(input);
    const settings = await new MciSettingsQueries(this.database).settings();
    return this.database.transaction(async (database) => {
      const [current] = await database.query<{ incidentId: string; tagNo: number; triageLevelId: string; statusId: string; zoneId: string; publicHidden: number; incidentStatus: string }>('SELECT p.incident_id AS incidentId, p.tag_no AS tagNo, p.triage_level_id AS triageLevelId, p.status_id AS statusId, p.zone_id AS zoneId, p.public_hidden AS publicHidden, i.status AS incidentStatus FROM mci_patient p JOIN mci_incident i ON i.id = p.incident_id WHERE p.id = ? FOR UPDATE', [patientId]);
      if (!current) return { ok: false as const, code: 'NOT_FOUND' as const };
      if (current.incidentStatus !== 'OPEN') return { ok: false as const, code: 'INCIDENT_CLOSED' as const };
      const commands = canCommandMci(subject);
      const actor = await loadActor(database, current.incidentId, subject.personId!);
      if (!mciCan(actor, commands, 'editPatient', current.zoneId)) return { ok: false as const, code: 'FORBIDDEN' as const };
      const known = (list: ReadonlyArray<{ id: string; isActive: boolean }>, id: string, previous: string) => id === previous || list.some((row) => row.id === id && row.isActive);
      if (!known(settings.triageLevels, patient.triageLevelId, current.triageLevelId) || !known(settings.statuses, patient.statusId, current.statusId) || !known(settings.zones, patient.zoneId, current.zoneId)) return { ok: false as const, code: 'NOT_FOUND' as const };
      const status = reconcileDeceased(patient, current, settings);
      if (!status.ok) return status;
      const needsDestination = settings.statuses.find((row) => row.id === status.statusId)?.needsDestination ?? false;
      if (needsDestination && !patient.destinationHospital) return { ok: false as const, code: 'DESTINATION_REQUIRED' as const };
      // ไม่เปิดเผยบนกระดาน is the ผู้บัญชาการ's call; anyone else's save keeps it as it was.
      const publicHidden = mciCan(actor, commands, 'assignRole') ? patient.publicHidden : Number(current.publicHidden) === 1;
      await database.execute('UPDATE mci_patient SET triage_level_id = ?, status_id = ?, zone_id = ?, destination_hospital = ?, first_name = ?, last_name = ?, gender = ?, age_estimate = ?, hn = ?, public_hidden = ?, updated_by = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?', [status.triageLevelId, status.statusId, patient.zoneId, needsDestination ? patient.destinationHospital : '', patient.firstName, patient.lastName, patient.gender, patient.ageEstimate, patient.hn, publicHidden ? 1 : 0, subject.personId!, patientId]);
      await database.execute('UPDATE mci_incident SET updated_at = UTC_TIMESTAMP() WHERE id = ?', [current.incidentId]);
      await mciAudit(database, this.createId, subject.personId!, 'mci.patient.update', 'mci_patient', patientId, { incidentId: current.incidentId, tag: formatTag(Number(current.tagNo)), triageLevelId: status.triageLevelId, statusId: status.statusId, zoneId: patient.zoneId, publicHidden });
      return { ok: true as const };
    });
  }
}
