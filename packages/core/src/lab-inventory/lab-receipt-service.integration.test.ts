import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, runMigrations } from '@backoffice/db';
import { LabReceiptService } from './lab-receipt-service';
import { fiscalYearBE } from './lab-rules';
import { labToday } from './lab-stock-writer';
import { addLabMember, insertLabItem, insertLabPerson, LAB_SEED, labSubject, setOpeningStatus } from './lab-test-fixtures';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('LabReceiptService against MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const service = new LabReceiptService(database);
  const vendorId = randomUUID();
  let keeper: string; let staff: string;
  let item: { id: string; code: string };
  const today = labToday();
  const mainBalance = async () => Number((await database.query<{ q: number | null }>('SELECT SUM(b.quantity) AS q FROM lab_lot_balance b JOIN lab_lot l ON l.id = b.lot_id WHERE l.item_id = ? AND b.store_id = ?', [item.id, LAB_SEED.stores.main]))[0]?.q ?? 0);
  const input = (overrides: Record<string, unknown> = {}) => ({ receivedOn: today, vendorId, invoiceNo: 'INV-1', lines: [{ itemId: item.id, lotNo: `L-${randomUUID().slice(0, 6)}`, expiryDate: '2099-01-31', quantityReceive: 2, pricePerReceive: 1250 }], ...overrides });

  beforeAll(async () => {
    await runMigrations(database);
    [keeper, staff] = await Promise.all([insertLabPerson(database), insertLabPerson(database)]);
    await addLabMember(database, keeper, 'KEEPER');
    await addLabMember(database, staff, 'STAFF', [LAB_SEED.sections.chem]);
    await database.execute("INSERT INTO lab_vendor (id, name, phone, is_active, created_at, updated_at) VALUES (?, ?, '', 1, UTC_TIMESTAMP(), UTC_TIMESTAMP())", [vendorId, `ผู้ขาย ${vendorId.slice(0, 8)}`]);
    item = await insertLabItem(database, 10);
  });
  afterAll(async () => { await setOpeningStatus(database, 'CERTIFIED'); await database.close(); });

  it('refuses receipts before the ยอดยกมา is certified', async () => {
    await setOpeningStatus(database, 'SUBMITTED');
    expect(await service.create(labSubject(keeper), input())).toEqual({ ok: false, code: 'OPENING_NOT_CERTIFIED' });
    await setOpeningStatus(database, 'CERTIFIED');
  });

  it('receives 2 boxes × 10 at 1,250 baht as 20 bottles at 125.0000, numbering by fiscal year', async () => {
    const first = await service.create(labSubject(keeper), input());
    const second = await service.create(labSubject(keeper), input());
    expect(first).toMatchObject({ ok: true, docNo: expect.stringMatching(new RegExp(`^LR-${fiscalYearBE(today)}-\\d{4,}$`)) });
    const number = (result: typeof first) => Number(result.ok ? result.docNo.split('-')[2] : NaN);
    expect(number(second)).toBe(number(first) + 1);
    expect(await mainBalance()).toBe(40);
    const [lot] = await database.query<{ unit_cost: string }>('SELECT unit_cost FROM lab_lot WHERE item_id = ? LIMIT 1', [item.id]);
    expect(Number(lot!.unit_cost)).toBe(125);
  });

  it('refuses a future date, an expiry before the receipt and a เจ้าหน้าที่', async () => {
    expect(await service.create(labSubject(keeper), input({ receivedOn: '2999-01-01' }))).toEqual({ ok: false, code: 'FUTURE_DATE' });
    expect(await service.create(labSubject(keeper), input({ lines: [{ itemId: item.id, lotNo: 'X', expiryDate: '2000-01-01', quantityReceive: 1, pricePerReceive: 1 }] }))).toEqual({ ok: false, code: 'EXPIRY_BEFORE_RECEIPT' });
    expect(await service.create(labSubject(staff), input())).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(await service.create(labSubject(keeper), input({ vendorId: randomUUID() }))).toEqual({ ok: false, code: 'NOT_FOUND' });
  });

  it('voids an untouched receipt back to zero and refuses one whose lot has moved', async () => {
    const before = await mainBalance();
    const created = await service.create(labSubject(keeper), input());
    const receiptId = created.ok ? created.receiptId : '';
    expect(await mainBalance()).toBe(before + 20);
    expect(await service.void(labSubject(keeper), receiptId, { reason: 'ใส่ผิด' })).toEqual({ ok: true });
    expect(await mainBalance()).toBe(before);
    expect(await service.void(labSubject(keeper), receiptId, { reason: 'ซ้ำ' })).toEqual({ ok: false, code: 'WRONG_STATUS' });

    const used = await service.create(labSubject(keeper), input());
    const usedId = used.ok ? used.receiptId : '';
    const [line] = await database.query<{ lot_id: string }>('SELECT lot_id FROM lab_receipt_line WHERE receipt_id = ?', [usedId]);
    await database.execute("INSERT INTO lab_movement (id, lot_id, store_id, quantity, kind, entry_date, ref_type, ref_id, note, created_by, created_at) VALUES (?, ?, ?, -1, 'ISSUE_OUT', ?, 'TEST', ?, '', ?, UTC_TIMESTAMP(6))", [randomUUID(), line!.lot_id, LAB_SEED.stores.main, today, randomUUID(), keeper]);
    expect(await service.void(labSubject(keeper), usedId, { reason: 'ใส่ผิด' })).toEqual({ ok: false, code: 'RECEIPT_LOT_IN_USE' });
    const [audit] = await database.query<{ metadata: string }>("SELECT metadata FROM audit_event WHERE action = 'lab.receipt.void' AND target_id = ?", [receiptId]);
    expect(audit?.metadata).not.toContain('ใส่ผิด');
  });
});
