import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AccessSubject } from '@backoffice/contracts';
import { createDatabase, runMigrations } from '@backoffice/db';
import { MciIncidentService } from './mci-incident-service';
import { MciPatientService } from './mci-patient-service';
import { MciResponderService } from './mci-responder-service';
import { closeOpenIncidents, insertMciPerson, MCI_SEED } from './mci-test-fixtures';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;
const NURSE_POSITION = '00000000-0000-4000-8001-000000000004';
const subjectOf = (personId: string, roles: string[] = []): AccessSubject => ({ authenticated: true, personId, roles: roles.map((name) => ({ name, organizationId: null })), dataOwnerModules: [] });

describeWithDatabase('check-in, staffing and casualties against MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const incidents = new MciIncidentService(database);
  const responders = new MciResponderService(database);
  const patients = new MciPatientService(database);
  let manager: AccessSubject;
  let nurse: AccessSubject;
  let staff: AccessSubject;
  let incidentId = '';
  const checkIn = async (who: AccessSubject, professionId: string) => {
    const result = await responders.checkIn(who, { professionId });
    if (!result.ok) throw new Error(result.code);
    return result;
  };

  beforeAll(async () => {
    await runMigrations(database);
    manager = subjectOf(await insertMciPerson(database), ['mci-manager']);
    nurse = subjectOf(await insertMciPerson(database, { positionId: NURSE_POSITION }));
    staff = subjectOf(await insertMciPerson(database));
  });
  beforeEach(async () => {
    await closeOpenIncidents(database);
    const opened = await incidents.open(manager.personId!, { title: 'ทดสอบ', kind: 'DRILL', occurredAt: '2026-11-10T03:00:00.000Z', notify: { mode: 'NONE', professionIds: [] } });
    if (!opened.ok) throw new Error('setup');
    incidentId = opened.incidentId;
  });
  afterAll(async () => { await closeOpenIncidents(database); await database.close(); });

  describe('check-in', () => {
    it('refuses when no เหตุ is open', async () => {
      await closeOpenIncidents(database);
      expect(await responders.checkIn(nurse, { professionId: MCI_SEED.professions.nurse })).toEqual({ ok: false, code: 'NO_OPEN_INCIDENT' });
    });

    it('sends a nurse to ER by rule, returns the same check-in twice, and makes the manager commander', async () => {
      const first = await checkIn(nurse, MCI_SEED.professions.nurse);
      expect(first).toMatchObject({ zoneId: MCI_SEED.zones.er, commandRole: 'STAFF' });
      expect((await checkIn(nurse, MCI_SEED.professions.nurse)).responderId).toBe(first.responderId);
      expect(await checkIn(manager, MCI_SEED.professions.doctor)).toMatchObject({ commandRole: 'COMMANDER' });
      expect(await responders.defaultProfession(nurse.personId!)).toBe(MCI_SEED.professions.nurse);
      expect(await responders.defaultProfession(staff.personId!)).toBeNull();
    });

    it('leaves a profession without a rule waiting, and allows checking in again after checking out', async () => {
      const first = await checkIn(staff, '00000000-0000-4000-a000-000000000305');
      expect(first.zoneId).toBeNull();
      expect(await responders.checkOut(staff, first.responderId)).toEqual({ ok: true });
      expect(await responders.checkOut(staff, first.responderId)).toEqual({ ok: false, code: 'ALREADY_OUT' });
      expect((await checkIn(staff, '00000000-0000-4000-a000-000000000305')).responderId).not.toBe(first.responderId);
    });
  });

  describe('staffing', () => {
    it('lets the commander set roles and zones, a zone lead move only people in their own zone, and staff nothing', async () => {
      const lead = await checkIn(nurse, MCI_SEED.professions.nurse);
      const other = await checkIn(staff, MCI_SEED.professions.porter);
      expect(other.zoneId).toBe(MCI_SEED.zones.triage);
      expect(await responders.update(staff, lead.responderId, { zoneId: MCI_SEED.zones.opd, commandRole: 'COMMANDER' })).toEqual({ ok: false, code: 'FORBIDDEN' });
      expect(await responders.update(manager, lead.responderId, { zoneId: MCI_SEED.zones.er, commandRole: 'ZONE_LEAD' })).toEqual({ ok: true });
      expect(await responders.update(nurse, other.responderId, { zoneId: MCI_SEED.zones.er, commandRole: 'STAFF' })).toEqual({ ok: false, code: 'FORBIDDEN' });
      expect(await responders.update(manager, other.responderId, { zoneId: MCI_SEED.zones.er, commandRole: 'STAFF' })).toEqual({ ok: true });
      expect(await responders.update(nurse, other.responderId, { zoneId: MCI_SEED.zones.opd, commandRole: 'STAFF' })).toEqual({ ok: true });
      expect(await responders.update(nurse, other.responderId, { zoneId: MCI_SEED.zones.er, commandRole: 'RECORDER' })).toEqual({ ok: false, code: 'FORBIDDEN' });
      expect(await responders.checkOut(nurse, other.responderId)).toEqual({ ok: false, code: 'FORBIDDEN' });
      expect(await responders.checkOut(manager, other.responderId)).toEqual({ ok: true });
    });
  });

  describe('casualties', () => {
    it('gives ten casualties saved at once ten consecutive tags', async () => {
      const results = await Promise.all(Array.from({ length: 10 }, () => patients.create(manager, { triageLevelId: MCI_SEED.triage.red, zoneId: MCI_SEED.zones.er })));
      const tags = results.map((result) => (result.ok ? result.tag : result.code)).sort();
      expect(tags).toEqual(Array.from({ length: 10 }, (_, index) => `MCI-${String(index + 1).padStart(3, '0')}`));
    });

    it('lets recorders record, refuses staff, and starts a black casualty as deceased', async () => {
      await checkIn(staff, MCI_SEED.professions.porter);
      expect(await patients.create(staff, { triageLevelId: MCI_SEED.triage.red, zoneId: MCI_SEED.zones.er })).toEqual({ ok: false, code: 'FORBIDDEN' });
      const created = await patients.create(manager, { triageLevelId: MCI_SEED.triage.black, zoneId: MCI_SEED.zones.er, firstName: 'สมชาย', lastName: 'ใจดี', hn: '1234567' });
      if (!created.ok) throw new Error('setup');
      const [row] = await database.query<{ statusId: string }>('SELECT status_id AS statusId FROM mci_patient WHERE id = ?', [created.patientId]);
      expect(row!.statusId).toBe(MCI_SEED.status.dead);
      const [audit] = await database.query<{ metadata: string }>("SELECT metadata FROM audit_event WHERE action = 'mci.patient.create' AND target_id = ?", [created.patientId]);
      expect(audit!.metadata).not.toContain('สมชาย');
      expect(audit!.metadata).not.toContain('1234567');
    });

    it('needs a destination for a referral, a new colour to leave death, keeps the board flag commander-only and freezes a closed เหตุ', async () => {
      const recorder = await checkIn(nurse, MCI_SEED.professions.nurse);
      await responders.update(manager, recorder.responderId, { zoneId: MCI_SEED.zones.er, commandRole: 'RECORDER' });
      const created = await patients.create(nurse, { triageLevelId: MCI_SEED.triage.yellow, zoneId: MCI_SEED.zones.opd });
      if (!created.ok) throw new Error('setup');
      const base = { triageLevelId: MCI_SEED.triage.yellow, statusId: MCI_SEED.status.treating, zoneId: MCI_SEED.zones.opd, firstName: 'สมหญิง', lastName: 'ดีใจ', publicHidden: true };
      expect(await patients.update(nurse, created.patientId, { ...base, statusId: MCI_SEED.status.referred })).toEqual({ ok: false, code: 'DESTINATION_REQUIRED' });
      expect(await patients.update(nurse, created.patientId, base)).toEqual({ ok: true });
      const [saved] = await database.query<{ publicHidden: number }>('SELECT public_hidden AS publicHidden FROM mci_patient WHERE id = ?', [created.patientId]);
      expect(Number(saved!.publicHidden)).toBe(0);
      expect(await patients.update(manager, created.patientId, base)).toEqual({ ok: true });
      expect(await patients.update(manager, created.patientId, { ...base, statusId: MCI_SEED.status.dead })).toEqual({ ok: true });
      expect(await patients.update(manager, created.patientId, { ...base, triageLevelId: MCI_SEED.triage.black })).toEqual({ ok: false, code: 'TRIAGE_REQUIRED' });
      await incidents.close(manager.personId!, incidentId);
      expect(await patients.update(manager, created.patientId, base)).toEqual({ ok: false, code: 'INCIDENT_CLOSED' });
      expect(await patients.update(manager, randomUUID(), base)).toEqual({ ok: false, code: 'NOT_FOUND' });
    });

    it('lets a zone lead edit casualties in their zone only', async () => {
      const lead = await checkIn(nurse, MCI_SEED.professions.nurse);
      await responders.update(manager, lead.responderId, { zoneId: MCI_SEED.zones.er, commandRole: 'ZONE_LEAD' });
      const inEr = await patients.create(nurse, { triageLevelId: MCI_SEED.triage.green, zoneId: MCI_SEED.zones.er });
      expect(await patients.create(nurse, { triageLevelId: MCI_SEED.triage.green, zoneId: MCI_SEED.zones.opd })).toEqual({ ok: false, code: 'FORBIDDEN' });
      const inOpd = await patients.create(manager, { triageLevelId: MCI_SEED.triage.green, zoneId: MCI_SEED.zones.opd });
      if (!inEr.ok || !inOpd.ok) throw new Error('setup');
      const change = { triageLevelId: MCI_SEED.triage.green, statusId: MCI_SEED.status.treating, zoneId: MCI_SEED.zones.ipd };
      expect(await patients.update(nurse, inOpd.patientId, change)).toEqual({ ok: false, code: 'FORBIDDEN' });
      expect(await patients.update(nurse, inEr.patientId, change)).toEqual({ ok: true });
    });
  });
});
