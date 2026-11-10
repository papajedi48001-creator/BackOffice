import { randomUUID } from 'node:crypto';
import { MCI_MODULE, mciOpenIncidentInputSchema, type MciOpenIncidentInput } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { mciAudit, mciOutbox } from './mci-db';

const OPEN_SUBJECT = 'ประกาศเหตุอุบัติเหตุหมู่ — กรุณารายงานตัว';
const CLOSE_SUBJECT = 'ปิดเหตุอุบัติเหตุหมู่แล้ว';
const LANDING = '/mci';
const drill = (kind: string, subject: string) => (kind === 'DRILL' ? `[ซ้อมแผน] ${subject}` : subject);
const toDatetime = (iso: string) => iso.slice(0, 19).replace('T', ' ');

/** เปิดเหตุ and ปิดเหตุ, with the bell notices and the LINE broadcast in the same transaction. Callers check `canCommandMci`. */
export class MciIncidentService {
  constructor(private readonly database: Database, private readonly createId: () => string = randomUUID) {}

  async open(actorPersonId: string, input: MciOpenIncidentInput): Promise<{ ok: true; incidentId: string } | { ok: false; code: 'INCIDENT_ALREADY_OPEN' }> {
    const incident = mciOpenIncidentInputSchema.parse(input);
    const incidentId = this.createId();
    return this.database.transaction(async (database) => {
      // One lock row serialises every open, so two commanders pressing at once cannot both open a เหตุ.
      await database.query('SELECT id FROM mci_incident_lock WHERE id = 1 FOR UPDATE');
      const [open] = await database.query<{ id: string }>("SELECT id FROM mci_incident WHERE status = 'OPEN' LIMIT 1");
      if (open) return { ok: false as const, code: 'INCIDENT_ALREADY_OPEN' as const };
      await database.execute("INSERT INTO mci_incident (id, title, kind, status, location, occurred_at, opened_by, opened_at, patient_seq, notify_mode, updated_at) VALUES (?, ?, ?, 'OPEN', ?, ?, ?, UTC_TIMESTAMP(), 0, ?, UTC_TIMESTAMP())", [incidentId, incident.title, incident.kind, incident.location, toDatetime(incident.occurredAt), actorPersonId, incident.notify.mode]);
      await mciAudit(database, this.createId, actorPersonId, 'mci.incident.open', 'mci_incident', incidentId, { kind: incident.kind, notify: incident.notify.mode });
      if (incident.notify.mode !== 'NONE') {
        const recipients = await this.recipients(database, incident.notify.mode === 'ALL' ? null : incident.notify.professionIds);
        for (const personId of recipients) await this.bell(database, `mci-open:${incidentId}`, personId, drill(incident.kind, OPEN_SUBJECT));
        await mciOutbox(database, 'mci.line.broadcast', `mci.line.broadcast:${incidentId}:OPENED`, { incidentId, event: 'OPENED' }, this.createId);
      }
      return { ok: true as const, incidentId };
    });
  }

  async close(actorPersonId: string, incidentId: string): Promise<{ ok: true } | { ok: false; code: 'NOT_FOUND' | 'INCIDENT_CLOSED' }> {
    return this.database.transaction(async (database) => {
      const [incident] = await database.query<{ status: string; kind: string; notifyMode: string }>('SELECT status, kind, notify_mode AS notifyMode FROM mci_incident WHERE id = ? FOR UPDATE', [incidentId]);
      if (!incident) return { ok: false as const, code: 'NOT_FOUND' as const };
      if (incident.status !== 'OPEN') return { ok: false as const, code: 'INCIDENT_CLOSED' as const };
      await database.execute("UPDATE mci_incident SET status = 'CLOSED', closed_by = ?, closed_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP() WHERE id = ?", [actorPersonId, incidentId]);
      const [{ stillIn }] = await database.query<{ stillIn: number }>('SELECT COUNT(*) AS stillIn FROM mci_responder WHERE incident_id = ? AND checked_out_at IS NULL', [incidentId]) as [{ stillIn: number }];
      await database.execute('UPDATE mci_responder SET checked_out_at = UTC_TIMESTAMP(), checked_out_by = ? WHERE incident_id = ? AND checked_out_at IS NULL', [actorPersonId, incidentId]);
      await mciAudit(database, this.createId, actorPersonId, 'mci.incident.close', 'mci_incident', incidentId, { checkedOut: Number(stillIn) });
      const came = await database.query<{ personId: string }>('SELECT DISTINCT person_id AS personId FROM mci_responder WHERE incident_id = ?', [incidentId]);
      for (const { personId } of came) await this.bell(database, `mci-close:${incidentId}`, personId, drill(incident.kind, CLOSE_SUBJECT));
      if (incident.notifyMode !== 'NONE') await mciOutbox(database, 'mci.line.broadcast', `mci.line.broadcast:${incidentId}:CLOSED`, { incidentId, event: 'CLOSED' }, this.createId);
      return { ok: true as const };
    });
  }

  /** บุคลากร still working here; with `professionIds`, only those whose HR position maps to one of them. */
  private async recipients(database: Database, professionIds: readonly string[] | null): Promise<string[]> {
    if (professionIds && professionIds.length === 0) return [];
    const rows = professionIds
      ? await database.query<{ id: string }>(`SELECT p.id FROM person p JOIN hr_person_profile h ON h.person_id = p.id JOIN mci_profession_position m ON m.position_id = h.position_id WHERE p.employment_status = 'ACTIVE' AND m.profession_id IN (${professionIds.map(() => '?').join(', ')})`, [...professionIds])
      : await database.query<{ id: string }>("SELECT id FROM person WHERE employment_status = 'ACTIVE'");
    return [...new Set(rows.map((row) => row.id))];
  }

  private bell(database: Database, key: string, recipientPersonId: string, subject: string): Promise<void> {
    return mciOutbox(database, 'notification.in_app', `notification.in_app:${key}:${recipientPersonId}`, { recipientPersonId, subject, targetPath: LANDING, moduleCode: MCI_MODULE }, this.createId);
  }
}
