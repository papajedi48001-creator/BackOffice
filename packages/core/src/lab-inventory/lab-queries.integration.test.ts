import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, runMigrations } from '@backoffice/db';
import { LabQueries } from './lab-queries';
import { LabReceiptService } from './lab-receipt-service';
import { LabRequisitionService } from './lab-requisition-service';
import { pickFefo } from './lab-rules';
import { findOrCreateLot, labToday, move } from './lab-stock-writer';
import { LabUsageService } from './lab-usage-service';
import { addLabMember, insertLabItem, insertLabPerson, LAB_SEED, labSubject, setOpeningStatus } from './lab-test-fixtures';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('LabQueries against MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const queries = new LabQueries(database);
  const today = labToday();
  const vendorId = randomUUID();
  let keeper: string; let head: string; let staff: string;
  let item: { id: string; code: string };
  let requisitionId: string;

  beforeAll(async () => {
    await runMigrations(database);
    [keeper, head, staff] = await Promise.all([insertLabPerson(database), insertLabPerson(database), insertLabPerson(database)]);
    await addLabMember(database, keeper, 'KEEPER');
    await addLabMember(database, head, 'HEAD');
    await addLabMember(database, staff, 'STAFF', [LAB_SEED.sections.chem]);
    await setOpeningStatus(database, 'CERTIFIED');
    await database.execute("INSERT INTO lab_vendor (id, name, phone, is_active, created_at, updated_at) VALUES (?, ?, '', 1, UTC_TIMESTAMP(), UTC_TIMESTAMP())", [vendorId, `ผู้ขาย ${vendorId.slice(0, 8)}`]);
    item = await insertLabItem(database, 10);
    await database.execute('INSERT INTO lab_item_reorder (item_id, store_id, reorder_point) VALUES (?, ?, 10)', [item.id, LAB_SEED.stores.chem]);
    await database.transaction(async (tx) => {
      const lot = await findOrCreateLot(tx, { itemId: item.id, lotNo: 'OPEN', expiryDate: '2099-06-30', unitCost: '100.0000', source: 'OPENING' });
      await move(tx, { lotId: lot, storeId: LAB_SEED.stores.main, quantity: 5, kind: 'OPENING', entryDate: today, refType: 'TEST', refId: randomUUID(), actorPersonId: keeper });
    });
    await new LabReceiptService(database).create(labSubject(keeper), { receivedOn: today, vendorId, invoiceNo: '', lines: [{ itemId: item.id, lotNo: 'R1', expiryDate: '2099-01-31', quantityReceive: 2, pricePerReceive: 1250 }] });
    const requisitions = new LabRequisitionService(database);
    const created = await requisitions.create(labSubject(staff), { sectionId: LAB_SEED.sections.chem, note: '', lines: [{ itemId: item.id, quantity: 8 }] });
    requisitionId = created.ok ? created.requisitionId : '';
    await requisitions.decide(labSubject(head), requisitionId, { decision: 'APPROVE', reason: '' });
  });
  afterAll(async () => { await database.close(); });

  it('suggests FEFO lots for an approved ใบขอเบิก, matching pickFefo over คลังหลัก', async () => {
    const [suggestion] = await queries.fefoSuggestion(requisitionId, today);
    const expected = pickFefo(await queries.lotOptions(LAB_SEED.stores.main, item.id), 8, today);
    expect(suggestion).toMatchObject({ itemId: item.id, quantityRequested: 8, suggestion: expected });
    expect(expected).toMatchObject({ ok: true, picks: [{ quantity: 8 }] });
    expect(suggestion!.lots.every((lot) => typeof lot.lotNo === 'string' && lot.lotNo.length > 0)).toBe(true);
    expect(await queries.pendingIssueCount()).toBeGreaterThanOrEqual(1);
  });

  it('agrees on balances per store and for the whole Lab, with value and the reorder flag', async () => {
    const [suggestion] = await queries.fefoSuggestion(requisitionId, today);
    const lineId = suggestion!.lineId;
    await new LabRequisitionService(database).issue(labSubject(keeper), requisitionId, { note: '', lines: [{ lineId, picks: suggestion!.suggestion.ok ? suggestion!.suggestion.picks : [] }] });
    await new LabUsageService(database).record(labSubject(staff), { storeId: LAB_SEED.stores.chem, itemId: item.id, quantity: 3, usageTypeId: LAB_SEED.usageTypes.qc, entryDate: today, note: '', picks: null });

    const main = (await queries.balances(LAB_SEED.stores.main)).find((row) => row.itemId === item.id);
    const chem = (await queries.balances(LAB_SEED.stores.chem)).find((row) => row.itemId === item.id);
    const all = (await queries.balances('ALL')).find((row) => row.itemId === item.id);
    expect(main).toMatchObject({ quantity: 17, nearestExpiry: '2099-01-31', belowReorder: false });
    expect(chem).toMatchObject({ quantity: 5, value: '625.00', belowReorder: true });
    expect(all).toMatchObject({ quantity: 22, belowReorder: false });
    expect(Number(main!.value) + Number(chem!.value)).toBeCloseTo(Number(all!.value), 2);
  });

  it('keeps a ledger whose running balance ends at the balance', async () => {
    const ledger = await queries.ledger(item.id, LAB_SEED.stores.chem, today, today);
    expect(ledger.openingBalance).toBe(0);
    expect(ledger.rows.map((row) => row.kind)).toEqual(['ISSUE_IN', 'USE']);
    expect(ledger.rows.at(-1)).toMatchObject({ balance: 5, usageTypeName: 'QC' });
    expect(ledger.rows[0]!.docNo).toMatch(/^LQ-/);
    const all = await queries.ledger(item.id, 'ALL', today, today);
    expect(all.rows.at(-1)!.balance).toBe(22);
  });

  it('lists documents with their lines', async () => {
    const requisition = await queries.requisition(requisitionId);
    expect(requisition).toMatchObject({ status: 'ISSUED', sectionId: LAB_SEED.sections.chem, lines: [{ itemId: item.id, quantityRequested: 8, quantityIssued: 8 }] });
    expect((await queries.requisitions({ sectionIds: [LAB_SEED.sections.chem] })).some((row) => row.id === requisitionId)).toBe(true);
    expect((await queries.receipts(today, today)).length).toBeGreaterThanOrEqual(1);
    expect((await queries.usages({ storeIds: [LAB_SEED.stores.chem], from: today, to: today })).some((row) => row.itemId === item.id && row.quantity === 3)).toBe(true);
  });
});
