import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AccessSubject } from '@backoffice/contracts';
import { createDatabase, runMigrations } from '@backoffice/db';
import { exportIncident } from './mci-export';
import { MciIncidentService } from './mci-incident-service';
import { MciPatientService } from './mci-patient-service';
import { MciQueries } from './mci-queries';
import { MciResponderService } from './mci-responder-service';
import { closeOpenIncidents, insertMciPerson, MCI_SEED } from './mci-test-fixtures';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('MciQueries against MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const queries = new MciQueries(database);
  let manager: AccessSubject;

  beforeAll(async () => {
    await runMigrations(database);
    await closeOpenIncidents(database);
    manager = { authenticated: true, personId: await insertMciPerson(database), roles: [{ name: 'mci-manager', organizationId: null }], dataOwnerModules: [] };
  });
  afterAll(async () => { await closeOpenIncidents(database); await database.close(); });

  it('shows an empty board when no เหตุ is open', async () => {
    expect(await queries.publicBoard()).toMatchObject({ incident: null, total: 0, people: [] });
  });

  it('reads the open เหตุ, its responders and casualties, and builds the board from them', async () => {
    const opened = await new MciIncidentService(database).open(manager.personId!, { title: 'ไฟไหม้โรงงาน', kind: 'REAL', occurredAt: '2026-11-10T03:00:00.000Z', notify: { mode: 'NONE', professionIds: [] } });
    if (!opened.ok) throw new Error('setup');
    await new MciResponderService(database).checkIn(manager, { professionId: MCI_SEED.professions.doctor });
    const created = await new MciPatientService(database).create(manager, { triageLevelId: MCI_SEED.triage.red, zoneId: MCI_SEED.zones.er, firstName: 'สมชาย', lastName: 'ใจดี' });
    if (!created.ok) throw new Error('setup');

    expect(await queries.openIncident()).toMatchObject({ id: opened.incidentId, title: 'ไฟไหม้โรงงาน', kind: 'REAL', status: 'OPEN', occurredAt: '2026-11-10T03:00:00.000Z', closedAt: null });
    expect(await queries.myResponder(opened.incidentId, manager.personId!)).toMatchObject({ zoneId: MCI_SEED.zones.er, zoneName: 'ER', professionName: 'แพทย์', commandRole: 'COMMANDER' });
    expect(await queries.responders(opened.incidentId)).toHaveLength(1);
    expect(await queries.patient(created.patientId)).toMatchObject({ incidentId: opened.incidentId, tagNo: 1, firstName: 'สมชาย', publicHidden: false });
    const board = await queries.publicBoard();
    expect(board).toMatchObject({ incident: { title: 'ไฟไหม้โรงงาน' }, total: 1, people: [{ name: 'สมชาย ใ.', place: 'ER' }] });
    expect((await queries.incidents()).find((row) => row.id === opened.incidentId)).toMatchObject({ patients: 1, responders: 1 });
  });

  it('exports a closed เหตุ as CSV with an audit row, and refuses an open one', async () => {
    const open = await queries.openIncident();
    if (!open) throw new Error('setup');
    expect(await exportIncident(database, manager.personId!, open.id, 'patients')).toEqual({ ok: false, code: 'INCIDENT_OPEN' });
    await new MciIncidentService(database).close(manager.personId!, open.id);
    const patients = await exportIncident(database, manager.personId!, open.id, 'patients');
    if (!patients.ok) throw new Error(patients.code);
    expect(patients.csv.split('\r\n')[0]).toBe('\uFEFF"เลขป้าย","สี","สถานะ","จุด","รพ.ปลายทาง","ชื่อ","นามสกุล","เพศ","อายุ (ประมาณ)","HN","ไม่เปิดเผยบนกระดาน","แก้ไขล่าสุด"');
    expect(patients.csv).toContain('"MCI-001","แดง","รับเข้า/คัดกรอง","ER","","สมชาย","ใจดี"');
    const responders = await exportIncident(database, manager.personId!, open.id, 'responders');
    if (!responders.ok) throw new Error(responders.code);
    expect(responders.csv).toContain('"แพทย์","ER","ผู้บัญชาการเหตุ"');
    const audits = await database.query<{ metadata: string }>("SELECT metadata FROM audit_event WHERE action = 'mci.incident.export' AND target_id = ?", [open.id]);
    expect(audits.map((row) => JSON.parse(row.metadata)).sort((a, b) => a.exportKind.localeCompare(b.exportKind))).toEqual([{ exportKind: 'patients', rows: 1 }, { exportKind: 'responders', rows: 1 }]);
  });
});
