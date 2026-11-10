import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, runMigrations } from '@backoffice/db';
import { insertPerson } from '../leave/leave-fixtures';
import { MciSettingsQueries } from './mci-settings-queries';
import { MciSettingsService } from './mci-settings-service';
import { insertPosition, MCI_SEED } from './mci-test-fixtures';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('MciSettingsService against MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const service = new MciSettingsService(database);
  const queries = new MciSettingsQueries(database);
  const actor = randomUUID();
  const run = randomUUID().slice(0, 6);
  const audits = async (action: string) => database.query<{ metadata: string }>('SELECT metadata FROM audit_event WHERE action = ? AND actor_person_id = ?', [action, actor]);

  beforeAll(async () => { await runMigrations(database); await insertPerson(database, actor); });
  afterAll(async () => { await database.close(); });

  it('reads the seeded settings with the deceased colour, the deceased status and the intake status', async () => {
    const settings = await queries.settings();
    expect(settings.deceasedTriageId).toBe(MCI_SEED.triage.black);
    expect(settings.deceasedStatusId).toBe(MCI_SEED.status.dead);
    expect(settings.intakeStatusId).toBe(MCI_SEED.status.intake);
    expect(settings.triageLevels.map((level) => level.name).slice(0, 5)).toEqual(['แดง', 'เหลือง', 'เขียว', 'ดำ', 'ขาว']);
    expect(settings.professions.find((profession) => profession.id === MCI_SEED.professions.nurse)?.positionIds).toContain('00000000-0000-4000-8001-000000000004');
    expect(settings.rules).toContainEqual({ professionId: MCI_SEED.professions.nurse, zoneId: MCI_SEED.zones.er });
  });

  it('adds and renames a zone, refuses a duplicate name and audits each save', async () => {
    const added = await service.saveZone(actor, null, { name: `จุด ${run}`, sortOrder: 50, isActive: true });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(await service.saveZone(actor, added.id, { name: `จุดใหม่ ${run}`, sortOrder: 51, isActive: false })).toEqual({ ok: true, id: added.id });
    expect(await service.saveZone(actor, null, { name: `จุดใหม่ ${run}`, sortOrder: 52, isActive: true })).toEqual({ ok: false, code: 'DUPLICATE_NAME' });
    expect(await service.saveZone(actor, randomUUID(), { name: `อื่น ${run}`, sortOrder: 1, isActive: true })).toEqual({ ok: false, code: 'NOT_FOUND' });
    expect((await queries.settings()).zones.find((zone) => zone.id === added.id)).toMatchObject({ name: `จุดใหม่ ${run}`, isActive: false });
    expect(await audits('mci.settings.zone.save')).toHaveLength(2);
  });

  it('keeps the deceased colour and status switched on', async () => {
    expect(await service.saveTriageLevel(actor, MCI_SEED.triage.black, { name: 'ดำ', description: 'เสียชีวิต', colorHex: '#111827', sortOrder: 4, isActive: false })).toEqual({ ok: false, code: 'PROTECTED' });
    expect(await service.saveStatus(actor, MCI_SEED.status.dead, { name: 'เสียชีวิต', sortOrder: 6, isActive: false })).toEqual({ ok: false, code: 'PROTECTED' });
    expect(await service.saveTriageLevel(actor, MCI_SEED.triage.black, { name: 'ดำ', description: 'เสียชีวิต', colorHex: '#000000', sortOrder: 4, isActive: true })).toEqual({ ok: true, id: MCI_SEED.triage.black });
    await service.saveTriageLevel(actor, MCI_SEED.triage.black, { name: 'ดำ', description: 'เสียชีวิต', colorHex: '#111827', sortOrder: 4, isActive: true });
  });

  it('moves an HR position to the profession saved last and replaces the rules and contact phone', async () => {
    const position = await insertPosition(database);
    const first = await service.saveProfession(actor, null, { name: `สายหนึ่ง ${run}`, sortOrder: 90, isActive: true, positionIds: [position] });
    const second = await service.saveProfession(actor, null, { name: `สายสอง ${run}`, sortOrder: 91, isActive: true, positionIds: [position] });
    if (!first.ok || !second.ok) throw new Error('setup');
    let settings = await queries.settings();
    expect(settings.professions.find((profession) => profession.id === first.id)?.positionIds).toEqual([]);
    expect(settings.professions.find((profession) => profession.id === second.id)?.positionIds).toEqual([position]);
    expect(await service.saveProfession(actor, null, { name: `สายสาม ${run}`, sortOrder: 92, isActive: true, positionIds: [randomUUID()] })).toEqual({ ok: false, code: 'NOT_FOUND' });

    const before = settings.rules;
    expect(await service.saveRules(actor, { rules: [...before, { professionId: second.id, zoneId: MCI_SEED.zones.opd }] })).toEqual({ ok: true });
    settings = await queries.settings();
    expect(settings.rules).toContainEqual({ professionId: second.id, zoneId: MCI_SEED.zones.opd });
    await service.saveRules(actor, { rules: before });

    expect(await service.saveContact(actor, { publicContactPhone: '043-000000' })).toEqual({ ok: true });
    expect((await queries.settings()).publicContactPhone).toBe('043-000000');
  });
});
