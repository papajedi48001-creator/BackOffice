import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, runMigrations } from '@backoffice/db';
import { LabUsageService } from './lab-usage-service';
import { findOrCreateLot, labToday, move } from './lab-stock-writer';
import { addLabMember, insertLabItem, insertLabPerson, LAB_SEED, labSubject, setOpeningStatus } from './lab-test-fixtures';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('LabUsageService against MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const service = new LabUsageService(database);
  let keeper: string; let staff: string; let otherStaff: string; let head: string;
  let item: { id: string; code: string };
  const lots: Record<string, string> = {};
  const today = labToday();
  const qty = async (lotId: string) => Number((await database.query<{ q: number }>('SELECT quantity AS q FROM lab_lot_balance WHERE lot_id = ? AND store_id = ?', [lotId, LAB_SEED.stores.chem]))[0]?.q ?? 0);
  const use = (by: string, overrides: Record<string, unknown> = {}) => service.record(labSubject(by), { storeId: LAB_SEED.stores.chem, itemId: item.id, quantity: 6, usageTypeId: LAB_SEED.usageTypes.patient, entryDate: today, note: '', picks: null, ...overrides });

  beforeAll(async () => {
    await runMigrations(database);
    [keeper, staff, otherStaff] = await Promise.all([insertLabPerson(database), insertLabPerson(database), insertLabPerson(database)]);
    await addLabMember(database, keeper, 'KEEPER');
    await addLabMember(database, staff, 'STAFF', [LAB_SEED.sections.chem]);
    await addLabMember(database, otherStaff, 'STAFF', [LAB_SEED.sections.chem]);
    head = await insertLabPerson(database);
    await addLabMember(database, head, 'HEAD');
    await setOpeningStatus(database, 'CERTIFIED');
    item = await insertLabItem(database, 10);
    await database.transaction(async (tx) => {
      for (const [name, expiryDate] of [['late', '2099-12-31'], ['soon', '2098-01-31'], ['expired', '2001-01-01']] as const) {
        lots[name] = await findOrCreateLot(tx, { itemId: item.id, lotNo: name, expiryDate, unitCost: '1.0000', source: 'OPENING' });
        await move(tx, { lotId: lots[name]!, storeId: LAB_SEED.stores.chem, quantity: 5, kind: 'OPENING', entryDate: today, refType: 'TEST', refId: randomUUID(), actorPersonId: keeper });
      }
    });
  });
  afterAll(async () => { await database.close(); });

  it('uses the earliest unexpired lot first in the เจ้าหน้าที่ own งาน', async () => {
    const result = await use(staff);
    expect(result).toMatchObject({ ok: true, picks: [{ lotId: lots.soon, quantity: 5 }, { lotId: lots.late, quantity: 1 }] });
    expect(await qty(lots.soon!)).toBe(0);
    expect(await qty(lots.late!)).toBe(4);
    expect(await qty(lots.expired!)).toBe(5);
  });

  it('refuses another งาน, คลังหลัก, a future date and an expired lot picked by hand', async () => {
    expect(await use(staff, { storeId: LAB_SEED.stores.hema })).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(await use(keeper, { storeId: LAB_SEED.stores.main })).toEqual({ ok: false, code: 'MAIN_STORE' });
    expect(await use(staff, { entryDate: '2999-01-01' })).toEqual({ ok: false, code: 'FUTURE_DATE' });
    expect(await use(staff, { quantity: 1, picks: [{ lotId: lots.expired, quantity: 1 }] })).toEqual({ ok: false, code: 'LOT_EXPIRED' });
    expect(await use(staff, { quantity: 99 })).toEqual({ ok: false, code: 'INSUFFICIENT_STOCK' });
  });

  it('reverses a usage back into its lots, keeping the USE rows, only for its recorder or a ผู้ดูแลคลัง', async () => {
    const result = await use(staff, { quantity: 2 });
    const usageId = result.ok ? result.usageId : '';
    expect(await qty(lots.late!)).toBe(2);
    expect(await service.reverse(labSubject(otherStaff), usageId, { reason: 'บันทึกผิด' })).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(await service.reverse(labSubject(keeper), usageId, { reason: 'บันทึกผิด' })).toEqual({ ok: true });
    expect(await qty(lots.late!)).toBe(4);
    expect(await service.reverse(labSubject(staff), usageId, { reason: 'ซ้ำ' })).toEqual({ ok: false, code: 'WRONG_STATUS' });
    const kinds = await database.query<{ kind: string }>("SELECT kind FROM lab_movement WHERE ref_type = 'USAGE' AND ref_id = ? ORDER BY created_at", [usageId]);
    expect(kinds.map((row) => row.kind)).toEqual(['USE', 'USE_REVERSAL']);
    const own = await use(staff, { quantity: 1 });
    expect(await service.reverse(labSubject(staff), own.ok ? own.usageId : '', { reason: 'ผิด' })).toEqual({ ok: true });
  });
  it('dates a reversal today, not on the day of the usage it undoes', async () => {
    const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    const result = await use(staff, { quantity: 1, entryDate: yesterday });
    const usageId = result.ok ? result.usageId : '';
    expect(await service.reverse(labSubject(staff), usageId, { reason: 'ผิดวัน' })).toEqual({ ok: true });
    const [row] = await database.query<{ d: string }>("SELECT DATE_FORMAT(entry_date, '%Y-%m-%d') AS d FROM lab_movement WHERE ref_type = 'USAGE' AND ref_id = ? AND kind = 'USE_REVERSAL'", [usageId]);
    expect(row?.d).toBe(today);
  });
  it("lets the หัวหน้า Lab reverse anyone's usage", async () => {
    const result = await use(staff, { quantity: 1 });
    expect(await service.reverse(labSubject(head), result.ok ? result.usageId : '', { reason: 'บันทึกซ้ำ' })).toEqual({ ok: true });
  });
});
