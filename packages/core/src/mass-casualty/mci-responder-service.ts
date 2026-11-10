import { randomUUID } from 'node:crypto';
import { mciCheckInInputSchema, mciResponderUpdateInputSchema, type AccessSubject, type MciCheckInInput, type MciCommandRole, type MciResponderUpdateInput } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { canCommandMci, mciCan } from './mci-access';
import { loadActor } from './mci-actor';
import { isDuplicateEntry, mciAudit } from './mci-db';
import { defaultZoneFor } from './mci-rules';

type CheckInResult = { ok: true; responderId: string; zoneId: string | null; commandRole: MciCommandRole } | { ok: false; code: 'NO_OPEN_INCIDENT' | 'NOT_FOUND' };
type ChangeResult = { ok: true } | { ok: false; code: 'NOT_FOUND' | 'FORBIDDEN' | 'ALREADY_OUT' | 'INCIDENT_CLOSED' };
interface ResponderRow { id: string; incidentId: string; personId: string; zoneId: string | null; commandRole: MciCommandRole; out: number; status: string }

/** การรายงานตัว and กำลังคน in the open เหตุ. Access is decided here from the caller's check-in (`mciCan`). */
export class MciResponderService {
  constructor(private readonly database: Database, private readonly createId: () => string = randomUUID) {}

  /** รายงานตัว: idempotent while checked in; the zone comes from กฎจัดคน and a `mci.command` holder becomes ผู้บัญชาการเหตุ. */
  async checkIn(subject: AccessSubject, input: MciCheckInInput): Promise<CheckInResult> {
    const { professionId } = mciCheckInInputSchema.parse(input);
    const personId = subject.personId!;
    const attempt = () => this.database.transaction(async (database): Promise<CheckInResult> => {
      const [incident] = await database.query<{ id: string }>("SELECT id FROM mci_incident WHERE status = 'OPEN' LIMIT 1 LOCK IN SHARE MODE");
      if (!incident) return { ok: false, code: 'NO_OPEN_INCIDENT' };
      const [existing] = await database.query<{ id: string; zoneId: string | null; commandRole: MciCommandRole }>('SELECT id, zone_id AS zoneId, command_role AS commandRole FROM mci_responder WHERE incident_id = ? AND person_id = ? AND checked_out_at IS NULL', [incident.id, personId]);
      if (existing) return { ok: true, responderId: existing.id, zoneId: existing.zoneId ?? null, commandRole: existing.commandRole };
      const [profession] = await database.query<{ id: string }>('SELECT id FROM mci_profession WHERE id = ? AND is_active = 1', [professionId]);
      if (!profession) return { ok: false, code: 'NOT_FOUND' };
      const rules = await database.query<{ professionId: string; zoneId: string | null }>('SELECT profession_id AS professionId, zone_id AS zoneId FROM mci_assignment_rule');
      const zones = await database.query<{ id: string }>('SELECT id FROM mci_zone WHERE is_active = 1');
      const zoneId = defaultZoneFor(professionId, rules, new Set(zones.map((zone) => zone.id)));
      const commandRole: MciCommandRole = canCommandMci(subject) ? 'COMMANDER' : 'STAFF';
      const responderId = this.createId();
      await database.execute('INSERT INTO mci_responder (id, incident_id, person_id, profession_id, zone_id, command_role, checked_in_at) VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())', [responderId, incident.id, personId, professionId, zoneId, commandRole]);
      await mciAudit(database, this.createId, personId, 'mci.responder.check_in', 'mci_responder', responderId, { incidentId: incident.id, professionId, zoneId, commandRole });
      return { ok: true, responderId, zoneId, commandRole };
    });
    try { return await attempt(); } catch (error) {
      // A double tap raced its twin: the other insert won, so read it back.
      if (isDuplicateEntry(error)) return attempt();
      throw error;
    }
  }

  /** ออกจากเวร: oneself always; someone else as ผู้บัญชาการ or as หัวหน้าจุด of their zone. */
  async checkOut(subject: AccessSubject, responderId: string): Promise<ChangeResult> {
    return this.database.transaction(async (database) => {
      const target = await this.lock(database, responderId);
      const refused = await this.refusal(database, subject, target, 'manageResponder');
      if (refused) return refused;
      await database.execute('UPDATE mci_responder SET checked_out_at = UTC_TIMESTAMP(), checked_out_by = ? WHERE id = ?', [subject.personId!, responderId]);
      await mciAudit(database, this.createId, subject.personId!, 'mci.responder.check_out', 'mci_responder', responderId, { incidentId: target!.incidentId });
      return { ok: true as const };
    });
  }

  /** ย้ายจุด / เปลี่ยนบทบาทสั่งการ. Changing the role is ผู้บัญชาการ only; moving needs the target's current zone. */
  async update(subject: AccessSubject, responderId: string, input: MciResponderUpdateInput): Promise<ChangeResult> {
    const change = mciResponderUpdateInputSchema.parse(input);
    return this.database.transaction(async (database) => {
      const target = await this.lock(database, responderId);
      const refused = await this.refusal(database, subject, target, change.commandRole !== target?.commandRole ? 'assignRole' : 'manageResponder', false);
      if (refused) return refused;
      if (change.zoneId) {
        const [zone] = await database.query<{ id: string }>('SELECT id FROM mci_zone WHERE id = ? AND is_active = 1', [change.zoneId]);
        if (!zone) return { ok: false as const, code: 'NOT_FOUND' as const };
      }
      await database.execute('UPDATE mci_responder SET zone_id = ?, command_role = ? WHERE id = ?', [change.zoneId, change.commandRole, responderId]);
      await mciAudit(database, this.createId, subject.personId!, 'mci.responder.update', 'mci_responder', responderId, { incidentId: target!.incidentId, zoneId: change.zoneId, commandRole: change.commandRole });
      return { ok: true as const };
    });
  }

  /** The สายวิชาชีพ of the person's HR position, to preselect at รายงานตัว. */
  async defaultProfession(personId: string): Promise<string | null> {
    const [row] = await this.database.query<{ professionId: string }>('SELECT m.profession_id AS professionId FROM hr_person_profile h JOIN mci_profession_position m ON m.position_id = h.position_id JOIN mci_profession p ON p.id = m.profession_id WHERE h.person_id = ? AND p.is_active = 1', [personId]);
    return row?.professionId ?? null;
  }

  private async lock(database: Database, responderId: string): Promise<ResponderRow | undefined> {
    const [row] = await database.query<ResponderRow>('SELECT r.id, r.incident_id AS incidentId, r.person_id AS personId, r.zone_id AS zoneId, r.command_role AS commandRole, r.checked_out_at IS NOT NULL AS `out`, i.status FROM mci_responder r JOIN mci_incident i ON i.id = r.incident_id WHERE r.id = ? FOR UPDATE', [responderId]);
    return row;
  }

  private async refusal(database: Database, subject: AccessSubject, target: ResponderRow | undefined, action: 'manageResponder' | 'assignRole', selfAllowed = true): Promise<ChangeResult | null> {
    if (!target) return { ok: false, code: 'NOT_FOUND' };
    if (target.status !== 'OPEN') return { ok: false, code: 'INCIDENT_CLOSED' };
    if (Number(target.out) === 1) return { ok: false, code: 'ALREADY_OUT' };
    if (selfAllowed && target.personId === subject.personId) return null;
    const actor = await loadActor(database, target.incidentId, subject.personId!);
    return mciCan(actor, canCommandMci(subject), action, target.zoneId) ? null : { ok: false, code: 'FORBIDDEN' };
  }
}
