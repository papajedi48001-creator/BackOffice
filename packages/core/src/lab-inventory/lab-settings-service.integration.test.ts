import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, runMigrations } from '@backoffice/db';
import { LabSettingsQueries } from './lab-settings-queries';
import { LabSettingsService } from './lab-settings-service';
import { addLabMember, insertLabItem, insertLabPerson, LAB_SEED, labSubject } from './lab-test-fixtures';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('LabSettingsService against MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const service = new LabSettingsService(database);
  const queries = new LabSettingsQueries(database);
  const run = randomUUID().slice(0, 6).toUpperCase();
  let manager: string; let keeper: string; let staff: string; let head: string;
  const item = (code: string, unitsPerReceive = 10) => ({ code, name: `วัสดุ ${code}`, receiveUnit: 'กล่อง', useUnit: 'ขวด', unitsPerReceive, isActive: true, reorderPoints: [{ storeId: LAB_SEED.stores.main, reorderPoint: 5 }] });
  const audits = (action: string, actor: string) => database.query<{ metadata: string }>('SELECT metadata FROM audit_event WHERE action = ? AND actor_person_id = ?', [action, actor]);

  beforeAll(async () => {
    await runMigrations(database);
    [manager, keeper, staff, head] = await Promise.all([insertLabPerson(database), insertLabPerson(database), insertLabPerson(database), insertLabPerson(database)]);
    await addLabMember(database, keeper, 'KEEPER');
    await addLabMember(database, head, 'HEAD');
  });
  afterAll(async () => { await database.close(); });

  it('lets a ผู้ดูแลคลัง add and rename an item with its reorder point, and refuses a duplicate code', async () => {
    const created = await service.saveItem(labSubject(keeper), null, item(`A${run}`));
    expect(created).toMatchObject({ ok: true });
    const id = created.ok ? created.id! : '';
    expect(await service.saveItem(labSubject(keeper), id, { ...item(`A${run}`), name: 'ชื่อใหม่' })).toEqual({ ok: true, id });
    const settings = await queries.settings();
    expect(settings.items.find((row) => row.id === id)).toMatchObject({ name: 'ชื่อใหม่', reorderPoints: [{ storeId: LAB_SEED.stores.main, reorderPoint: 5 }] });
    expect(await service.saveItem(labSubject(keeper), null, item(`A${run}`))).toEqual({ ok: false, code: 'DUPLICATE' });
    expect(await audits('lab.settings.item.save', keeper)).toHaveLength(2);
  });

  it('refuses to change the pack size once the item has a lot', async () => {
    const { id, code } = await insertLabItem(database, 10);
    await database.execute("INSERT INTO lab_lot (id, item_id, lot_no, expiry_date, unit_cost, source, created_at) VALUES (?, ?, 'L', NULL, 1, 'OPENING', UTC_TIMESTAMP(6))", [randomUUID(), id]);
    expect(await service.saveItem(labSubject(keeper), id, item(code, 12))).toEqual({ ok: false, code: 'ITEM_HAS_STOCK' });
    expect(await service.saveItem(labSubject(keeper), id, item(code, 10))).toEqual({ ok: true, id });
  });

  it('creates a store for a new งาน', async () => {
    const result = await service.saveSection(labSubject(manager, 'lab-manager'), null, { code: `S${run}`, name: `งานทดสอบ ${run}`, sortOrder: 99, isActive: true });
    expect(result.ok).toBe(true);
    const section = (await queries.settings()).sections.find((row) => row.code === `S${run}`);
    expect(section?.storeId).toEqual(expect.any(String));
  });

  it('keeps one usage type switched on', async () => {
    const settings = await queries.settings();
    const active = settings.usageTypes.filter((type) => type.isActive);
    for (const type of active.slice(1)) await service.saveUsageType(labSubject(keeper), type.id, { name: type.name, sortOrder: type.sortOrder, isActive: false });
    const last = active[0]!;
    expect(await service.saveUsageType(labSubject(keeper), last.id, { name: last.name, sortOrder: last.sortOrder, isActive: false })).toEqual({ ok: false, code: 'PROTECTED' });
    for (const type of active.slice(1)) await service.saveUsageType(labSubject(keeper), type.id, { name: type.name, sortOrder: type.sortOrder, isActive: true });
  });

  it('lets only a lab.manage holder save members, and stores a STAFF member with their งาน', async () => {
    const input = { personId: staff, role: 'STAFF' as const, sectionIds: [LAB_SEED.sections.chem] };
    expect(await service.saveMember(labSubject(keeper), input)).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(await service.saveMember(labSubject(manager, 'lab-manager'), input)).toEqual({ ok: true });
    expect((await queries.settings()).members.find((member) => member.personId === staff)).toMatchObject({ role: 'STAFF', sectionIds: [LAB_SEED.sections.chem] });
    expect(await service.saveMember(labSubject(manager, 'lab-manager'), { ...input, sectionIds: [LAB_SEED.sections.hema] })).toEqual({ ok: true });
    expect((await queries.settings()).members.find((member) => member.personId === staff)?.sectionIds).toEqual([LAB_SEED.sections.hema]);
    expect(await service.removeMember(labSubject(manager, 'lab-manager'), staff)).toEqual({ ok: true });
    expect((await queries.settings()).members.some((member) => member.personId === staff)).toBe(false);
  });

  it('refuses settings to a หัวหน้า Lab and a non-member', async () => {
    expect(await service.saveVendor(labSubject(head), null, { name: `ผู้ขาย ${run}`, isActive: true })).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(await service.saveVendor(labSubject(staff), null, { name: `ผู้ขาย ${run}`, isActive: true })).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(await service.saveVendor(labSubject(keeper), null, { name: `ผู้ขาย ${run}`, isActive: true })).toMatchObject({ ok: true });
  });
});
