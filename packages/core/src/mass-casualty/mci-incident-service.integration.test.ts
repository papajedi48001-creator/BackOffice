import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, runMigrations } from '@backoffice/db';
import { MciIncidentService } from './mci-incident-service';
import { closeOpenIncidents, insertMciPerson, MCI_SEED } from './mci-test-fixtures';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;
const NURSE_POSITION = '00000000-0000-4000-8001-000000000004';
const DOCTOR_POSITION = '00000000-0000-4000-8001-000000000001';

describeWithDatabase('MciIncidentService against MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const service = new MciIncidentService(database);
  let commander = '';
  let nurse = '';
  let doctor = '';
  const input = (mode: 'ALL' | 'PROFESSIONS' | 'NONE', professionIds: string[] = []) => ({ title: 'รถบัสคว่ำ', kind: 'DRILL' as const, occurredAt: '2026-11-10T03:00:00.000Z', notify: { mode, professionIds } });
  const outboxFor = (incidentId: string) => database.query<{ type: string; idempotencyKey: string; payload: string }>('SELECT type, idempotency_key AS idempotencyKey, payload FROM outbox_event WHERE idempotency_key LIKE ?', [`%${incidentId}%`]);

  beforeAll(async () => {
    await runMigrations(database);
    commander = await insertMciPerson(database);
    nurse = await insertMciPerson(database, { positionId: NURSE_POSITION });
    doctor = await insertMciPerson(database, { positionId: DOCTOR_POSITION });
  });
  beforeEach(async () => { await closeOpenIncidents(database); });
  afterAll(async () => { await closeOpenIncidents(database); await database.close(); });

  it('opens one เหตุ at a time, even when two open at once', async () => {
    const raced = await Promise.all([service.open(commander, input('NONE')), service.open(commander, input('NONE'))]);
    expect(raced.filter((result) => result.ok)).toHaveLength(1);
    expect(raced.filter((result) => !result.ok)).toEqual([{ ok: false, code: 'INCIDENT_ALREADY_OPEN' }]);
    expect(await service.open(commander, input('NONE'))).toEqual({ ok: false, code: 'INCIDENT_ALREADY_OPEN' });
  });

  it('calls only the chosen professions in the bell, sends one LINE broadcast and never puts the title in the outbox', async () => {
    const opened = await service.open(commander, input('PROFESSIONS', [MCI_SEED.professions.nurse]));
    if (!opened.ok) throw new Error('setup');
    const events = await outboxFor(opened.incidentId);
    const bell = events.filter((event) => event.type === 'notification.in_app');
    expect(bell.some((event) => event.idempotencyKey.endsWith(nurse))).toBe(true);
    expect(bell.some((event) => event.idempotencyKey.endsWith(doctor))).toBe(false);
    expect(JSON.parse(bell[0]!.payload)).toMatchObject({ subject: '[ซ้อมแผน] ประกาศเหตุอุบัติเหตุหมู่ — กรุณารายงานตัว', targetPath: '/mci', moduleCode: 'mass-casualty' });
    expect(events.filter((event) => event.type === 'mci.line.broadcast').map((event) => JSON.parse(event.payload))).toEqual([{ incidentId: opened.incidentId, event: 'OPENED' }]);
    expect(events.some((event) => event.payload.includes('รถบัสคว่ำ'))).toBe(false);
    const [audit] = await database.query<{ metadata: string }>("SELECT metadata FROM audit_event WHERE action = 'mci.incident.open' AND target_id = ?", [opened.incidentId]);
    expect(JSON.parse(audit!.metadata)).toEqual({ kind: 'DRILL', notify: 'PROFESSIONS' });
  });

  it('sends nothing when told not to notify', async () => {
    const opened = await service.open(commander, input('NONE'));
    if (!opened.ok) throw new Error('setup');
    expect(await outboxFor(opened.incidentId)).toEqual([]);
  });

  it('closes the เหตุ, checks everyone out and tells those who came', async () => {
    const opened = await service.open(commander, input('PROFESSIONS', [MCI_SEED.professions.doctor]));
    if (!opened.ok) throw new Error('setup');
    const responder = randomUUID();
    await database.execute("INSERT INTO mci_responder (id, incident_id, person_id, profession_id, zone_id, command_role, checked_in_at) VALUES (?, ?, ?, NULL, NULL, 'STAFF', UTC_TIMESTAMP())", [responder, opened.incidentId, nurse]);
    expect(await service.close(commander, opened.incidentId)).toEqual({ ok: true });
    expect(await service.close(commander, opened.incidentId)).toEqual({ ok: false, code: 'INCIDENT_CLOSED' });
    expect(await service.close(commander, randomUUID())).toEqual({ ok: false, code: 'NOT_FOUND' });
    const [row] = await database.query<{ checkedOutBy: string | null; out: number }>('SELECT checked_out_by AS checkedOutBy, checked_out_at IS NOT NULL AS `out` FROM mci_responder WHERE id = ?', [responder]);
    expect(row).toMatchObject({ checkedOutBy: commander, out: 1 });
    const events = await outboxFor(opened.incidentId);
    expect(events.some((event) => event.type === 'notification.in_app' && event.idempotencyKey.endsWith(nurse) && event.payload.includes('ปิดเหตุอุบัติเหตุหมู่แล้ว'))).toBe(true);
    expect(events.filter((event) => event.type === 'mci.line.broadcast').map((event) => JSON.parse(event.payload).event).sort()).toEqual(['CLOSED', 'OPENED']);
  });

  it('keeps a เหตุ opened without notices quiet on LINE when it closes', async () => {
    const opened = await service.open(commander, input('NONE'));
    if (!opened.ok) throw new Error('setup');
    await service.close(commander, opened.incidentId);
    expect((await outboxFor(opened.incidentId)).filter((event) => event.type === 'mci.line.broadcast')).toEqual([]);
  });
});
