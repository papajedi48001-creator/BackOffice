import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, runMigrations } from '@backoffice/db';
import { LabOpeningService } from './lab-opening-service';
import { LabSettingsQueries } from './lab-settings-queries';
import { addLabMember, insertLabItem, insertLabPerson, LAB_SEED, labSubject, setOpeningStatus } from './lab-test-fixtures';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;
const header = 'คลัง,รหัสวัสดุ,เลขล็อต,วันหมดอายุ,จำนวนหน่วยใช้,ต้นทุนต่อหน่วยใช้';

describeWithDatabase('LabOpeningService against MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const service = new LabOpeningService(database);
  let keeper: string; let head: string; let staff: string;
  let item: { id: string; code: string };
  const balance = async (storeId: string) => Number((await database.query<{ q: number | null }>('SELECT SUM(b.quantity) AS q FROM lab_lot_balance b JOIN lab_lot l ON l.id = b.lot_id WHERE l.item_id = ? AND b.store_id = ?', [item.id, storeId]))[0]?.q ?? 0);

  beforeAll(async () => {
    await runMigrations(database);
    [keeper, head, staff] = await Promise.all([insertLabPerson(database), insertLabPerson(database), insertLabPerson(database)]);
    await addLabMember(database, keeper, 'KEEPER');
    await addLabMember(database, head, 'HEAD');
    await addLabMember(database, staff, 'STAFF', [LAB_SEED.sections.chem]);
    item = await insertLabItem(database, 10);
    await database.execute('DELETE FROM lab_opening_line');
    await setOpeningStatus(database, 'DRAFT');
  });
  afterAll(async () => { await setOpeningStatus(database, 'CERTIFIED'); await database.close(); });

  it('imports the item register by code, adding and updating', async () => {
    const csv = `รหัส,ชื่อ,หน่วยรับ,หน่วยใช้,อัตราแปลง,จุดสั่งซื้อคลังหลัก\n${item.code},ชื่อจากไฟล์,กล่อง,ขวด,10,7`;
    expect(await service.importItems(labSubject(keeper), csv)).toEqual({ ok: true, count: 1 });
    const [row] = await database.query<{ name: string; reorder_point: number }>('SELECT i.name, r.reorder_point FROM lab_item i JOIN lab_item_reorder r ON r.item_id = i.id AND r.store_id = ? WHERE i.id = ?', [LAB_SEED.stores.main, item.id]);
    expect(row).toMatchObject({ name: 'ชื่อจากไฟล์', reorder_point: 7 });
  });

  it('rejects an invalid opening file with row errors and writes nothing', async () => {
    const result = await service.importOpening(labSubject(keeper), `${header}\nคลังหลัก,NOPE,L1,,1,1`);
    expect(result).toMatchObject({ ok: false, code: 'INVALID_CSV', errors: [{ row: 2 }] });
    expect(await database.query('SELECT id FROM lab_opening_line')).toHaveLength(0);
  });

  it('refuses a เจ้าหน้าที่ the draft and a ผู้ดูแลคลัง the certification', async () => {
    expect(await service.submit(labSubject(staff))).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(await service.decide(labSubject(keeper), { decision: 'CERTIFY', reason: '' })).toEqual({ ok: false, code: 'FORBIDDEN' });
  });

  it('imports, submits, is returned with a reason, and is certified into lots, balances and OPENING movements', async () => {
    const csv = `${header}\nคลังหลัก,${item.code},L1,2027-01-31,20,125\nCHEM,${item.code},L1,2027-01-31,5,125`;
    expect(await service.importOpening(labSubject(keeper), csv)).toEqual({ ok: true, count: 2 });
    expect(await service.submit(labSubject(keeper))).toEqual({ ok: true });
    expect(await service.importOpening(labSubject(keeper), csv)).toEqual({ ok: false, code: 'WRONG_STATUS' });
    expect(await service.decide(labSubject(head), { decision: 'RETURN', reason: '' })).toEqual({ ok: false, code: 'REASON_REQUIRED' });
    expect(await service.decide(labSubject(head), { decision: 'RETURN', reason: 'นับใหม่' })).toEqual({ ok: true });
    const [notice] = await database.query<{ payload: string }>("SELECT payload FROM outbox_event WHERE type = 'notification.in_app' AND payload LIKE ? ORDER BY occurred_at DESC LIMIT 1", [`%${keeper}%`]);
    expect(notice?.payload).not.toContain('นับใหม่');
    expect(await service.submit(labSubject(keeper))).toEqual({ ok: true });
    expect(await service.decide(labSubject(head), { decision: 'CERTIFY', reason: '' })).toEqual({ ok: true });
    expect(await balance(LAB_SEED.stores.main)).toBe(20);
    expect(await balance(LAB_SEED.stores.chem)).toBe(5);
    const movements = await database.query<{ kind: string }>('SELECT m.kind FROM lab_movement m JOIN lab_lot l ON l.id = m.lot_id WHERE l.item_id = ?', [item.id]);
    expect(movements.map((row) => row.kind)).toEqual(['OPENING', 'OPENING']);
    expect(await database.query<{ id: string }>('SELECT id FROM lab_lot WHERE item_id = ?', [item.id])).toHaveLength(1);
    expect(await service.decide(labSubject(head), { decision: 'CERTIFY', reason: '' })).toEqual({ ok: false, code: 'WRONG_STATUS' });
    expect(await service.importOpening(labSubject(keeper), csv)).toEqual({ ok: false, code: 'WRONG_STATUS' });
  });
  it('keeps a long return reason and shows it on the draft until it is sent again', async () => {
    await database.execute('DELETE FROM lab_opening_line');
    await setOpeningStatus(database, 'DRAFT');
    expect(await service.submit(labSubject(keeper))).toEqual({ ok: true });
    const reason = 'ตรวจนับใหม่ '.repeat(40).trim();
    expect(reason.length).toBeGreaterThan(255);
    expect(await service.decide(labSubject(head), { decision: 'RETURN', reason })).toEqual({ ok: true });
    expect(await new LabSettingsQueries(database).settings()).toMatchObject({ openingStatus: 'DRAFT', openingReturnReason: reason });
    expect(await service.submit(labSubject(keeper))).toEqual({ ok: true });
    expect((await new LabSettingsQueries(database).settings()).openingReturnReason).toBeNull();
    expect(await service.decide(labSubject(head), { decision: 'RETURN', reason: 'อีกครั้ง' })).toEqual({ ok: true });
  });

  it('lets a ผู้จัดการ certify their own submission only from the manager tier, with a reason, flagged selfApproval', async () => {
    const manager = await insertLabPerson(database);
    await setOpeningStatus(database, 'DRAFT');
    expect(await service.submit(labSubject(manager, 'lab-manager'))).toEqual({ ok: true });
    expect(await service.decide(labSubject(manager, 'lab-manager', 'employee'), { decision: 'CERTIFY', reason: 'ไม่มีหัวหน้า' })).toEqual({ ok: false, code: 'CONFLICT_OF_INTEREST' });
    expect(await service.decide(labSubject(manager, 'lab-manager'), { decision: 'CERTIFY', reason: '' })).toEqual({ ok: false, code: 'REASON_REQUIRED' });
    expect(await service.decide(labSubject(manager, 'lab-manager'), { decision: 'CERTIFY', reason: 'ไม่มีหัวหน้า Lab ในวันนี้' })).toEqual({ ok: true });
    const [audit] = await database.query<{ metadata: string }>("SELECT metadata FROM audit_event WHERE action = 'lab.opening.certify' AND actor_person_id = ? ORDER BY created_at DESC LIMIT 1", [manager]);
    expect(JSON.parse(audit!.metadata)).toMatchObject({ selfApproval: true });
    expect(audit!.metadata).not.toContain('ไม่มีหัวหน้า');
  });
});
