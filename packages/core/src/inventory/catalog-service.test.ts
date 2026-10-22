import { describe, expect, it } from 'vitest';
import type { InventoryActor } from '@backoffice/contracts';
import { redactAuditMetadata } from '../audit/redact';
import { DuplicateBarcodeError, InventoryCatalogService } from './catalog-service';
import { InMemoryInventoryCatalogRepository } from './in-memory-inventory-catalog-repository';

function setup() {
  const repository = new InMemoryInventoryCatalogRepository();
  let sequence = 0;
  const service = new InventoryCatalogService(repository, undefined, () => `id-${++sequence}`);
  return { repository, service };
}

const officer: InventoryActor = { personId: 'officer', roles: [{ name: 'inventory-officer', organizationId: null }] };
const supervisor: InventoryActor = { personId: 'supervisor', roles: [{ name: 'inventory-supervisor', organizationId: null }] };
const unitOfficer: InventoryActor = { personId: 'unit-officer', roles: [{ name: 'inventory-officer', organizationId: 'ward-1' }] };
const itemInput = (categoryId: string, overrides: Record<string, unknown> = {}) => ({ code: 'ab-01', name: 'ถุงมือยาง', categoryId, issueUnit: 'ชิ้น', purchaseUnit: 'กล่อง', purchaseUnitFactor: 100, reorderPoint: 50, tracksExpiry: true, isActive: true, ...overrides });

async function withCategory() {
  const context = setup();
  const category = await context.service.createCategory(officer, { name: 'วัสดุการแพทย์', isActive: true });
  return { ...context, category };
}

describe('InventoryCatalogService', () => {
  it('creates an item with an upper-case code and audits only its id', async () => {
    const { repository, service, category } = await withCategory();

    const item = await service.createItem(officer, itemInput(category.id));

    expect(repository.items.get(item.id)).toMatchObject({ code: 'AB-01', name: 'ถุงมือยาง', purchaseUnitFactor: 100 });
    const event = repository.audit.at(-1)!;
    expect(event).toMatchObject({ action: 'inventory.item.created', targetType: 'inventory_item', targetId: item.id, actorPersonId: 'officer' });
    expect(JSON.parse(event.metadata)).toEqual({ itemId: item.id });
  });

  it.each([['a supervisor', supervisor], ['an officer scoped to one unit', unitOfficer]])('refuses %s', async (_label, actor) => {
    const { service } = setup();
    await expect(service.createCategory(actor, { name: 'วัสดุสำนักงาน', isActive: true })).rejects.toThrow('FORBIDDEN');
  });

  it('refuses a second item with the same code in another case', async () => {
    const { service, category } = await withCategory();
    await service.createItem(officer, itemInput(category.id));
    await expect(service.createItem(officer, itemInput(category.id, { code: 'AB-01', name: 'อื่น' }))).rejects.toThrow('DUPLICATE_CODE');
  });

  it('refuses an item in an inactive category', async () => {
    const { service } = setup();
    const closed = await service.createCategory(officer, { name: 'เลิกใช้', isActive: false });
    await expect(service.createItem(officer, itemInput(closed.id))).rejects.toThrow('CATEGORY_INACTIVE');
  });

  it('names the item that already owns a barcode', async () => {
    const { service, category } = await withCategory();
    const first = await service.createItem(officer, itemInput(category.id));
    const second = await service.createItem(officer, itemInput(category.id, { code: 'AB-02' }));
    await service.addBarcode(officer, first.id, { barcode: '8851234567890', unitKind: 'PURCHASE' });

    const error = await service.addBarcode(officer, second.id, { barcode: '8851234567890', unitKind: 'ISSUE' }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(DuplicateBarcodeError);
    expect((error as DuplicateBarcodeError).itemCode).toBe('AB-01');
  });

  it('records barcode changes as an item update', async () => {
    const { repository, service, category } = await withCategory();
    const item = await service.createItem(officer, itemInput(category.id));
    const barcode = await service.addBarcode(officer, item.id, { barcode: '8851234567890', unitKind: 'PURCHASE' });
    await service.removeBarcode(officer, barcode.id);

    expect(repository.barcodes.size).toBe(0);
    expect(repository.audit.slice(-2).map((event) => [event.action, JSON.parse(event.metadata)])).toEqual([
      ['inventory.item.updated', { itemId: item.id, changedFields: ['barcodes'] }],
      ['inventory.item.updated', { itemId: item.id, changedFields: ['barcodes'] }]
    ]);
  });

  it('refuses to change expiry tracking once the item has lots but allows other edits', async () => {
    const { repository, service, category } = await withCategory();
    const item = await service.createItem(officer, itemInput(category.id));
    repository.itemsWithLots.add(item.id);

    await expect(service.updateItem(officer, item.id, itemInput(category.id, { tracksExpiry: false }))).rejects.toThrow('ITEM_HAS_LOTS');
    await expect(service.updateItem(officer, item.id, itemInput(category.id, { reorderPoint: 80 }))).resolves.toMatchObject({ reorderPoint: 80 });
    expect(JSON.parse(repository.audit.at(-1)!.metadata)).toEqual({ itemId: item.id, changedFields: ['reorderPoint'] });
  });

  it('refuses a vendor name that already exists', async () => {
    const { service } = setup();
    await service.createVendor(officer, { name: 'บริษัท เอ จำกัด', isActive: true });
    await expect(service.createVendor(officer, { name: 'บริษัท เอ จำกัด', isActive: true })).rejects.toThrow('DUPLICATE_NAME');
  });

  it('reports a missing item', async () => {
    const { service } = setup();
    await expect(service.addBarcode(officer, 'missing', { barcode: '123', unitKind: 'ISSUE' })).rejects.toThrow('ITEM_NOT_FOUND');
  });
});

describe('inventory audit metadata', () => {
  it('keeps references and counts but drops prices', () => {
    expect(redactAuditMetadata({ reference: 'RC-2569-0001', lineCount: 2, itemId: 'item-1', vendorId: 'vendor-1', unitPrice: 5, documentNo: 'INV-1' })).toEqual({ reference: 'RC-2569-0001', lineCount: 2, itemId: 'item-1', vendorId: 'vendor-1' });
  });
});
