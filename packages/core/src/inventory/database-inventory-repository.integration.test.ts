import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, runMigrations } from '@backoffice/db';
import type { InventoryActor } from '@backoffice/contracts';
import { DuplicateBarcodeError, InventoryCatalogService } from './catalog-service';
import { DatabaseInventoryCatalogRepository, DatabaseInventoryRepository } from './database-inventory-repository';
import { bangkokDate } from './quantities';
import { ensureCertifiedOpening, seedInventoryPeople } from './inventory-test-fixtures';
import { InventoryReceiptService } from './receipt-service';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('inventory on MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  let officer: InventoryActor;
  let supervisor: InventoryActor;
  let itemId: string;
  let vendorId: string;
  const catalog = () => new InventoryCatalogService(new DatabaseInventoryCatalogRepository(database));
  const receipts = () => new InventoryReceiptService(new DatabaseInventoryRepository(database));
  const today = () => bangkokDate(new Date());
  const delivery = (quantity = 3) => ({ vendorId, documentNo: 'IV-1', receivedOn: today(), lines: [{ itemId, unitKind: 'PURCHASE' as const, quantity, unitPrice: 99.5 }] });

  async function lotBalances(receiptId: string) {
    return database.query<{ onHand: number; ledger: string }>(
      `SELECT l.on_hand_quantity AS onHand, (SELECT COALESCE(SUM(m.quantity), 0) FROM inventory_movement m WHERE m.lot_id = l.id) AS ledger
       FROM inventory_lot l JOIN inventory_receipt_line rl ON rl.id = l.receipt_line_id WHERE rl.receipt_id = ?`, [receiptId]);
  }

  beforeAll(async () => {
    await runMigrations(database);
    ({ officer, supervisor } = await seedInventoryPeople(database));
    const category = await catalog().createCategory(officer, { name: `หมวดทดสอบ ${randomUUID().slice(0, 8)}`, isActive: true });
    const item = await catalog().createItem(officer, { code: `T-${randomUUID().slice(0, 8)}`, name: 'กระดาษทดสอบ', categoryId: category.id, issueUnit: 'รีม', purchaseUnit: 'กล่อง', purchaseUnitFactor: 5, reorderPoint: 10, tracksExpiry: false, isActive: true });
    itemId = item.id;
    vendorId = (await catalog().createVendor(officer, { name: `ผู้ขายทดสอบ ${randomUUID().slice(0, 8)}`, isActive: true })).id;
    await ensureCertifiedOpening(database, officer, supervisor, { itemId, unitKind: 'ISSUE', quantity: 4, unitPrice: 10 });
  });
  afterAll(async () => database.close());

  it('keeps every lot equal to the sum of its movements through post and void', async () => {
    const receipt = await receipts().postDelivery(officer, delivery());
    expect((await lotBalances(receipt.id)).map((row) => [Number(row.onHand), Number(row.ledger)])).toEqual([[15, 15]]);
    const stored = (await database.query<{ unitCost: string; lineTotal: string }>('SELECT unit_cost AS unitCost, line_total AS lineTotal FROM inventory_receipt_line WHERE receipt_id = ?', [receipt.id]))[0]!;
    expect([String(stored.unitCost), String(stored.lineTotal)]).toEqual(['19.9000', '298.50']);

    await receipts().voidDelivery(officer, { receiptId: receipt.id, reason: 'บันทึกซ้ำ' });
    expect((await lotBalances(receipt.id)).map((row) => [Number(row.onHand), Number(row.ledger)])).toEqual([[0, 0]]);
  });

  it('gives concurrent deliveries distinct references and lot codes', async () => {
    const posted = await Promise.all(Array.from({ length: 5 }, () => receipts().postDelivery(officer, delivery(1))));
    expect(new Set(posted.map((receipt) => receipt.reference)).size).toBe(5);
    const codes = await database.query<{ lotCode: string }>(`SELECT l.lot_code AS lotCode FROM inventory_lot l JOIN inventory_receipt_line rl ON rl.id = l.receipt_line_id WHERE rl.receipt_id IN (${posted.map(() => '?').join(', ')})`, posted.map((receipt) => receipt.id));
    expect(new Set(codes.map((row) => row.lotCode)).size).toBe(5);
  });

  it('lets only one of two concurrent voids through', async () => {
    const receipt = await receipts().postDelivery(officer, delivery());
    const results = await Promise.allSettled([receipts().voidDelivery(officer, { receiptId: receipt.id, reason: 'ซ้ำ' }), receipts().voidDelivery(officer, { receiptId: receipt.id, reason: 'ซ้ำ' })]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({ reason: { message: 'RECEIPT_NOT_VOIDABLE' } });
    expect((await lotBalances(receipt.id)).map((row) => Number(row.ledger))).toEqual([0]);
  });

  it('reports a barcode added twice at once as a duplicate of the first item', async () => {
    const barcode = `885${Date.now()}`;
    const results = await Promise.allSettled([catalog().addBarcode(officer, itemId, { barcode, unitKind: 'ISSUE' }), catalog().addBarcode(officer, itemId, { barcode, unitKind: 'PURCHASE' })]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const failure = results.find((result) => result.status === 'rejected') as PromiseRejectedResult;
    expect(failure.reason).toBeInstanceOf(DuplicateBarcodeError);
  });

  it('refuses a second record with a taken code or name instead of overwriting the first', async () => {
    const repository = new DatabaseInventoryCatalogRepository(database);
    const first = await repository.findItem(itemId);
    await expect(repository.saveItem({ ...first!, id: randomUUID(), name: 'ชื่อที่ไม่ควรทับ' })).rejects.toThrow('DUPLICATE_CODE');
    expect((await repository.findItem(itemId))?.name).toBe(first!.name);

    const vendor = await repository.findVendor(vendorId);
    await expect(repository.saveVendor({ ...vendor!, id: randomUUID(), phone: '099' })).rejects.toThrow('DUPLICATE_NAME');
    expect((await repository.findVendor(vendorId))?.phone).toBe(vendor!.phone);

    const category = await repository.findCategory(first!.categoryId);
    await expect(repository.saveCategory({ ...category!, id: randomUUID(), isActive: false })).rejects.toThrow('DUPLICATE_NAME');
    expect((await repository.findCategory(first!.categoryId))?.isActive).toBe(true);
  });

  it('reads the catalogue back with the same values', async () => {
    const repository = new DatabaseInventoryCatalogRepository(database);
    expect(await repository.findItem(itemId)).toMatchObject({ purchaseUnitFactor: 5, reorderPoint: 10, tracksExpiry: false, isActive: true });
    expect(await repository.itemHasLots(itemId)).toBe(true);
  });
});
