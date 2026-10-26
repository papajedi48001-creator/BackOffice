import type { AuditEvent } from '@backoffice/contracts';
import type { InventoryBarcodeRecord, InventoryCatalogRepository, InventoryCategoryRecord, InventoryItemRecord, InventoryVendorRecord } from './catalog-service';

// Test double with the same observable behaviour as the MariaDB repository.
export class InMemoryInventoryCatalogRepository implements InventoryCatalogRepository {
  categories = new Map<string, InventoryCategoryRecord>();
  items = new Map<string, InventoryItemRecord>();
  barcodes = new Map<string, InventoryBarcodeRecord>();
  vendors = new Map<string, InventoryVendorRecord>();
  itemsWithLots = new Set<string>();
  audit: AuditEvent[] = [];

  async transaction<T>(work: (repository: InventoryCatalogRepository) => Promise<T>): Promise<T> { return work(this); }
  async findCategory(id: string) { return this.categories.get(id) ?? null; }
  async findCategoryByName(name: string) { return [...this.categories.values()].find((category) => category.name === name) ?? null; }
  async saveCategory(category: InventoryCategoryRecord) { this.categories.set(category.id, { ...category }); }
  async findItem(id: string) { return this.items.get(id) ?? null; }
  async findItemByCode(code: string) { return [...this.items.values()].find((item) => item.code === code) ?? null; }
  async saveItem(item: InventoryItemRecord) { this.items.set(item.id, { ...item }); }
  async itemHasLots(itemId: string) { return this.itemsWithLots.has(itemId); }
  async findBarcode(barcode: string) {
    const found = [...this.barcodes.values()].find((candidate) => candidate.barcode === barcode);
    return found ? { ...found, itemCode: this.items.get(found.itemId)!.code } : null;
  }
  async findBarcodeById(id: string) { return this.barcodes.get(id) ?? null; }
  async insertBarcode(barcode: InventoryBarcodeRecord) { this.barcodes.set(barcode.id, { ...barcode }); }
  async deleteBarcode(id: string) { this.barcodes.delete(id); }
  async findVendor(id: string) { return this.vendors.get(id) ?? null; }
  async findVendorByName(name: string) { return [...this.vendors.values()].find((vendor) => vendor.name === name) ?? null; }
  async saveVendor(vendor: InventoryVendorRecord) { this.vendors.set(vendor.id, { ...vendor }); }
  async appendAudit(event: AuditEvent) { this.audit.push(event); }
}
