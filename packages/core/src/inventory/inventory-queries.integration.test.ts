import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, runMigrations } from '@backoffice/db';
import type { InventoryActor } from '@backoffice/contracts';
import { InventoryCatalogService, type InventoryItemRecord } from './catalog-service';
import { DatabaseInventoryCatalogRepository, DatabaseInventoryRepository } from './database-inventory-repository';
import { InventoryQueries } from './inventory-queries';
import { ensureCertifiedOpening, seedInventoryPeople } from './inventory-test-fixtures';
import { bangkokDate } from './quantities';
import { InventoryReceiptService } from './receipt-service';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('inventory queries on MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const queries = () => new InventoryQueries(database);
  const suffix = randomUUID().slice(0, 6).toUpperCase();
  let officer: InventoryActor;
  let gloves: InventoryItemRecord;
  let paper: InventoryItemRecord;
  let receiptId: string;
  let lotCodes: string[];
  const boxBarcode = `885${Date.now()}`;
  const today = () => bangkokDate(new Date());

  beforeAll(async () => {
    await runMigrations(database);
    const people = await seedInventoryPeople(database);
    officer = people.officer;
    const catalog = new InventoryCatalogService(new DatabaseInventoryCatalogRepository(database));
    const category = await catalog.createCategory(officer, { name: `หมวด ${suffix}`, isActive: true });
    gloves = await catalog.createItem(officer, { code: `GL-${suffix}`, name: `ถุงมือ ${suffix}`, categoryId: category.id, issueUnit: 'ชิ้น', purchaseUnit: 'กล่อง', purchaseUnitFactor: 100, reorderPoint: 500, tracksExpiry: true, isActive: true });
    paper = await catalog.createItem(officer, { code: `PA-${suffix}`, name: `กระดาษ ${suffix}`, categoryId: category.id, issueUnit: 'รีม', purchaseUnit: 'กล่อง', purchaseUnitFactor: 5, reorderPoint: 0, tracksExpiry: false, isActive: true });
    await catalog.addBarcode(officer, gloves.id, { barcode: boxBarcode, unitKind: 'PURCHASE' });
    const vendor = await catalog.createVendor(officer, { name: `ผู้ขาย ${suffix}`, isActive: true });
    // On an empty database this suite certifies the opening balance; give it an item the assertions do not look at.
    const openingItem = await catalog.createItem(officer, { code: `OB-${suffix}`, name: `ยอดยกมา ${suffix}`, categoryId: category.id, issueUnit: 'ชิ้น', purchaseUnit: 'ชิ้น', purchaseUnitFactor: 1, reorderPoint: 0, tracksExpiry: false, isActive: true });
    await ensureCertifiedOpening(database, officer, people.supervisor, { itemId: openingItem.id, unitKind: 'ISSUE', quantity: 1, unitPrice: 1 });
    const receipt = await new InventoryReceiptService(new DatabaseInventoryRepository(database)).postDelivery(officer, {
      vendorId: vendor.id, documentNo: 'IV-9', receivedOn: today(), lines: [
        { itemId: gloves.id, unitKind: 'PURCHASE', quantity: 2, unitPrice: 250, expiryDate: '2099-12-31' },
        { itemId: gloves.id, unitKind: 'PURCHASE', quantity: 1, unitPrice: 300, expiryDate: '2098-01-31' },
        { itemId: gloves.id, unitKind: 'ISSUE', quantity: 40, unitPrice: 3, expiryDate: '2097-06-30' },
        { itemId: paper.id, unitKind: 'PURCHASE', quantity: 1, unitPrice: 600 }
      ]
    });
    receiptId = receipt.id;
    lotCodes = (await database.query<{ lotCode: string }>('SELECT l.lot_code AS lotCode FROM inventory_lot l JOIN inventory_receipt_line rl ON rl.id = l.receipt_line_id WHERE rl.receipt_id = ? ORDER BY rl.line_no', [receiptId])).map((row) => row.lotCode);
    // The third gloves lot stands in for stock that has since expired.
    await database.execute('UPDATE inventory_lot SET expiry_date = ? WHERE lot_code = ?', ['2020-01-01', lotCodes[2]]);
  });
  afterAll(async () => database.close());

  it('finds a lot label even with scanner whitespace and lower case', async () => {
    expect(await queries().resolveScan(` ${lotCodes[0]!.toLowerCase()}\r`)).toMatchObject({ kind: 'lot', item: { id: gloves.id, code: gloves.code }, lot: { lotCode: lotCodes[0], onHandQuantity: 200 } });
  });

  it('finds a manufacturer box barcode with its unit', async () => {
    expect(await queries().resolveScan(boxBarcode)).toMatchObject({ kind: 'barcode', unitKind: 'PURCHASE', item: { id: gloves.id, purchaseUnitFactor: 100, tracksExpiry: true } });
  });

  it('finds an item code typed in lower case', async () => {
    expect(await queries().resolveScan(paper.code.toLowerCase())).toMatchObject({ kind: 'item', item: { id: paper.id } });
  });

  it('returns null for an unknown or empty code', async () => {
    expect(await queries().resolveScan('NO-SUCH-CODE')).toBeNull();
    expect(await queries().resolveScan('   ')).toBeNull();
  });

  it('counts only unexpired stock and flags items under their reorder point', async () => {
    const rows = (await queries().listStock({ search: suffix }, today())).filter((row) => row.code !== `OB-${suffix}`);
    expect(rows.map((row) => [row.code, row.onHand, row.value, row.nearestExpiry, row.belowReorder])).toEqual([
      [gloves.code, 300, '800.00', '2098-01-31', true],
      [paper.code, 5, '600.00', null, false]
    ]);
  });

  it('finds stock by an exact barcode', async () => {
    expect((await queries().listStock({ search: boxBarcode }, today())).map((row) => row.code)).toEqual([gloves.code]);
  });

  it('lists lots in the order they should go out, with expired lots apart', async () => {
    const detail = (await queries().itemDetail(gloves.id, today()))!;
    expect(detail.lots.map((lot) => lot.lotCode)).toEqual([lotCodes[1], lotCodes[0]]);
    expect(detail.expiredLots.map((lot) => lot.lotCode)).toEqual([lotCodes[2]]);
    expect(detail.barcodes.map((barcode) => barcode.barcode)).toEqual([boxBarcode]);
    expect(detail.movements[0]).toMatchObject({ kind: 'RECEIPT', actorName: 'เจ้าหน้าที่พัสดุ ทดสอบ' });
    expect(detail.movements.map((movement) => movement.reference)).toContain((await queries().receiptDetail(receiptId))!.reference);
  });

  it('shows a receipt with its lines, lots and history', async () => {
    const detail = (await queries().receiptDetail(receiptId))!;
    expect(detail).toMatchObject({ status: 'POSTED', vendorName: `ผู้ขาย ${suffix}`, documentNo: 'IV-9', total: '1520.00' });
    expect(detail.lines.map((line) => [line.itemCode, line.enteredQuantity, line.issueQuantity, line.lotCode])).toEqual([
      [gloves.code, 2, 200, lotCodes[0]], [gloves.code, 1, 100, lotCodes[1]], [gloves.code, 40, 40, lotCodes[2]], [paper.code, 1, 5, lotCodes[3]]
    ]);
    expect(detail.history.map((entry) => entry.action)).toEqual(['POSTED']);
    expect((await queries().listReceipts()).find((summary) => summary.id === receiptId)).toMatchObject({ lineCount: 4, total: '1520.00' });
  });

  it('gives labels only what is printed on them', async () => {
    const labels = await queries().labelLots(receiptId);
    expect(labels).toHaveLength(4);
    expect(Object.keys(labels[0]!).sort()).toEqual(['expiryDate', 'itemCode', 'itemName', 'lotCode', 'receivedOn']);
    expect(labels[3]).toEqual({ lotCode: lotCodes[3], itemCode: paper.code, itemName: paper.name, expiryDate: null, receivedOn: today() });
  });
});
