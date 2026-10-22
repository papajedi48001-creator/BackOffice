import { randomUUID } from 'node:crypto';
import { inventoryBarcodeInputSchema, inventoryCategoryInputSchema, inventoryItemInputSchema, inventoryVendorInputSchema, type AuditEvent, type InventoryActor, type InventoryBarcodeInput, type InventoryCategoryInput, type InventoryItemInput, type InventoryUnitKind, type InventoryVendorInput } from '@backoffice/contracts';
import { AuthorizationService } from '../access/authorization-service';
import { AuditService } from '../audit/audit-service';
import { requireInventoryPermission } from './inventory-access';

export interface InventoryCategoryRecord { id: string; name: string; isActive: boolean; }
export interface InventoryItemRecord { id: string; code: string; name: string; categoryId: string; issueUnit: string; purchaseUnit: string; purchaseUnitFactor: number; reorderPoint: number; tracksExpiry: boolean; isActive: boolean; }
export interface InventoryBarcodeRecord { id: string; itemId: string; barcode: string; unitKind: InventoryUnitKind; }
export interface InventoryVendorRecord { id: string; name: string; phone: string; address: string; isActive: boolean; }

export class DuplicateBarcodeError extends Error {
  constructor(public readonly itemCode: string) { super('DUPLICATE_BARCODE'); }
}

export interface InventoryCatalogRepository {
  transaction<T>(work: (repository: InventoryCatalogRepository) => Promise<T>): Promise<T>;
  findCategory(id: string): Promise<InventoryCategoryRecord | null>;
  findCategoryByName(name: string): Promise<InventoryCategoryRecord | null>;
  saveCategory(category: InventoryCategoryRecord): Promise<void>;
  findItem(id: string): Promise<InventoryItemRecord | null>;
  findItemByCode(code: string): Promise<InventoryItemRecord | null>;
  saveItem(item: InventoryItemRecord): Promise<void>;
  itemHasLots(itemId: string): Promise<boolean>;
  findBarcode(barcode: string): Promise<(InventoryBarcodeRecord & { itemCode: string }) | null>;
  findBarcodeById(id: string): Promise<InventoryBarcodeRecord | null>;
  insertBarcode(barcode: InventoryBarcodeRecord): Promise<void>;
  deleteBarcode(id: string): Promise<void>;
  findVendor(id: string): Promise<InventoryVendorRecord | null>;
  findVendorByName(name: string): Promise<InventoryVendorRecord | null>;
  saveVendor(vendor: InventoryVendorRecord): Promise<void>;
  appendAudit(event: AuditEvent): Promise<void>;
}

const changedFields = <T extends object>(before: T, after: T) => (Object.keys(after) as (keyof T)[]).filter((key) => key !== 'id' && before[key] !== after[key]) as string[];

export class InventoryCatalogService {
  constructor(private readonly repository: InventoryCatalogRepository, private readonly authorizer: AuthorizationService = new AuthorizationService(), private readonly createId: () => string = randomUUID) {}

  async createCategory(actor: InventoryActor, input: InventoryCategoryInput): Promise<InventoryCategoryRecord> {
    this.requireManager(actor);
    const category: InventoryCategoryRecord = { id: this.createId(), ...inventoryCategoryInputSchema.parse(input) };
    return this.repository.transaction(async (repository) => {
      if (await repository.findCategoryByName(category.name)) throw new Error('DUPLICATE_NAME');
      await repository.saveCategory(category);
      await this.audit(repository, actor, 'inventory.category.created', 'inventory_category', category.id, {});
      return category;
    });
  }

  async updateCategory(actor: InventoryActor, categoryId: string, input: InventoryCategoryInput): Promise<InventoryCategoryRecord> {
    this.requireManager(actor);
    const category: InventoryCategoryRecord = { id: categoryId, ...inventoryCategoryInputSchema.parse(input) };
    return this.repository.transaction(async (repository) => {
      const existing = await repository.findCategory(categoryId);
      if (!existing) throw new Error('CATEGORY_NOT_FOUND');
      const sameName = await repository.findCategoryByName(category.name);
      if (sameName && sameName.id !== categoryId) throw new Error('DUPLICATE_NAME');
      await repository.saveCategory(category);
      await this.audit(repository, actor, 'inventory.category.updated', 'inventory_category', categoryId, { changedFields: changedFields(existing, category) });
      return category;
    });
  }

  async createItem(actor: InventoryActor, input: InventoryItemInput): Promise<InventoryItemRecord> {
    this.requireManager(actor);
    const item: InventoryItemRecord = { id: this.createId(), ...inventoryItemInputSchema.parse(input) };
    return this.repository.transaction(async (repository) => {
      await this.requireUsableCategory(repository, item.categoryId);
      if (await repository.findItemByCode(item.code)) throw new Error('DUPLICATE_CODE');
      await repository.saveItem(item);
      await this.audit(repository, actor, 'inventory.item.created', 'inventory_item', item.id, { itemId: item.id });
      return item;
    });
  }

  async updateItem(actor: InventoryActor, itemId: string, input: InventoryItemInput): Promise<InventoryItemRecord> {
    this.requireManager(actor);
    const item: InventoryItemRecord = { id: itemId, ...inventoryItemInputSchema.parse(input) };
    return this.repository.transaction(async (repository) => {
      const existing = await repository.findItem(itemId);
      if (!existing) throw new Error('ITEM_NOT_FOUND');
      if (existing.categoryId !== item.categoryId) await this.requireUsableCategory(repository, item.categoryId);
      const sameCode = await repository.findItemByCode(item.code);
      if (sameCode && sameCode.id !== itemId) throw new Error('DUPLICATE_CODE');
      if (existing.tracksExpiry !== item.tracksExpiry && await repository.itemHasLots(itemId)) throw new Error('ITEM_HAS_LOTS');
      await repository.saveItem(item);
      await this.audit(repository, actor, 'inventory.item.updated', 'inventory_item', itemId, { itemId, changedFields: changedFields(existing, item) });
      return item;
    });
  }

  async addBarcode(actor: InventoryActor, itemId: string, input: InventoryBarcodeInput): Promise<InventoryBarcodeRecord> {
    this.requireManager(actor);
    const barcode: InventoryBarcodeRecord = { id: this.createId(), itemId, ...inventoryBarcodeInputSchema.parse(input) };
    return this.repository.transaction(async (repository) => {
      if (!(await repository.findItem(itemId))) throw new Error('ITEM_NOT_FOUND');
      const existing = await repository.findBarcode(barcode.barcode);
      if (existing) throw new DuplicateBarcodeError(existing.itemCode);
      await repository.insertBarcode(barcode);
      await this.audit(repository, actor, 'inventory.item.updated', 'inventory_item', itemId, { itemId, changedFields: ['barcodes'] });
      return barcode;
    });
  }

  async removeBarcode(actor: InventoryActor, barcodeId: string): Promise<void> {
    this.requireManager(actor);
    await this.repository.transaction(async (repository) => {
      const barcode = await repository.findBarcodeById(barcodeId);
      if (!barcode) throw new Error('BARCODE_NOT_FOUND');
      await repository.deleteBarcode(barcodeId);
      await this.audit(repository, actor, 'inventory.item.updated', 'inventory_item', barcode.itemId, { itemId: barcode.itemId, changedFields: ['barcodes'] });
    });
  }

  async createVendor(actor: InventoryActor, input: InventoryVendorInput): Promise<InventoryVendorRecord> {
    this.requireManager(actor);
    const vendor: InventoryVendorRecord = { id: this.createId(), ...inventoryVendorInputSchema.parse(input) };
    return this.repository.transaction(async (repository) => {
      if (await repository.findVendorByName(vendor.name)) throw new Error('DUPLICATE_NAME');
      await repository.saveVendor(vendor);
      await this.audit(repository, actor, 'inventory.vendor.created', 'inventory_vendor', vendor.id, { vendorId: vendor.id });
      return vendor;
    });
  }

  async updateVendor(actor: InventoryActor, vendorId: string, input: InventoryVendorInput): Promise<InventoryVendorRecord> {
    this.requireManager(actor);
    const vendor: InventoryVendorRecord = { id: vendorId, ...inventoryVendorInputSchema.parse(input) };
    return this.repository.transaction(async (repository) => {
      const existing = await repository.findVendor(vendorId);
      if (!existing) throw new Error('VENDOR_NOT_FOUND');
      const sameName = await repository.findVendorByName(vendor.name);
      if (sameName && sameName.id !== vendorId) throw new Error('DUPLICATE_NAME');
      await repository.saveVendor(vendor);
      await this.audit(repository, actor, 'inventory.vendor.updated', 'inventory_vendor', vendorId, { vendorId, changedFields: changedFields(existing, vendor) });
      return vendor;
    });
  }

  private requireManager(actor: InventoryActor): void {
    requireInventoryPermission(this.authorizer, actor, 'inventory.item.manage');
  }

  private async requireUsableCategory(repository: InventoryCatalogRepository, categoryId: string): Promise<void> {
    const category = await repository.findCategory(categoryId);
    if (!category) throw new Error('CATEGORY_NOT_FOUND');
    if (!category.isActive) throw new Error('CATEGORY_INACTIVE');
  }

  private async audit(repository: InventoryCatalogRepository, actor: InventoryActor, action: string, targetType: string, targetId: string, metadata: Record<string, unknown>): Promise<void> {
    await new AuditService({ append: (event) => repository.appendAudit(event) }, this.createId).recordAudit({ actorPersonId: actor.personId, action, targetType, targetId, result: 'SUCCESS', metadata });
  }
}
