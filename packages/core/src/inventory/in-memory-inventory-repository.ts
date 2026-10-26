import type { AuditEvent, InventoryReceiptHistoryAction, OutboxEvent } from '@backoffice/contracts';
import type { InventoryItemRecord, InventoryVendorRecord } from './catalog-service';
import type { InventoryLotRecord, InventoryMovementRecord, InventoryReceiptHistoryEntry, InventoryReceiptLineRecord, InventoryReceiptRecord, InventoryRepository } from './inventory-repository';

// Test double with the same observable behaviour as the MariaDB repository.
export class InMemoryInventoryRepository implements InventoryRepository {
  receipts = new Map<string, InventoryReceiptRecord>();
  lines: InventoryReceiptLineRecord[] = [];
  items = new Map<string, InventoryItemRecord>();
  vendors = new Map<string, InventoryVendorRecord>();
  lots: InventoryLotRecord[] = [];
  movements: InventoryMovementRecord[] = [];
  history: InventoryReceiptHistoryEntry[] = [];
  roleHolders = new Map<string, string[]>();
  sequences = new Map<string, number>();
  outbox: OutboxEvent[] = [];
  audit: AuditEvent[] = [];

  async transaction<T>(work: (repository: InventoryRepository) => Promise<T>): Promise<T> { return work(this); }
  async findOpeningForUpdate() { const found = [...this.receipts.values()].find((receipt) => receipt.kind === 'OPENING'); return found ? { ...found } : null; }
  async lockReceipt(receiptId: string) { const found = this.receipts.get(receiptId); return found ? { ...found } : null; }
  async insertReceipt(receipt: InventoryReceiptRecord) { this.receipts.set(receipt.id, { ...receipt }); }
  async updateReceipt(receiptId: string, patch: Partial<InventoryReceiptRecord>) { this.receipts.set(receiptId, { ...this.receipts.get(receiptId)!, ...patch }); }
  async replaceLines(receiptId: string, lines: InventoryReceiptLineRecord[]) { this.lines = [...this.lines.filter((line) => line.receiptId !== receiptId), ...lines.map((line) => ({ ...line }))]; }
  async listLines(receiptId: string) { return this.lines.filter((line) => line.receiptId === receiptId).sort((left, right) => left.lineNo - right.lineNo).map((line) => ({ ...line })); }
  async findItems(itemIds: string[]) { return itemIds.map((id) => this.items.get(id)).filter((item): item is InventoryItemRecord => item !== undefined); }
  async findVendor(vendorId: string) { return this.vendors.get(vendorId) ?? null; }
  async nextSequence(kind: string, buddhistYear: number) { const key = `${kind}-${buddhistYear}`; const next = (this.sequences.get(key) ?? 0) + 1; this.sequences.set(key, next); return next; }
  async insertLots(lots: InventoryLotRecord[]) { this.lots.push(...lots.map((lot) => ({ ...lot }))); }
  async lockLotsOfReceipt(receiptId: string) {
    const lineIds = new Set(this.lines.filter((line) => line.receiptId === receiptId).map((line) => line.id));
    return this.lots.filter((lot) => lineIds.has(lot.receiptLineId)).map((lot) => ({ ...lot }));
  }
  async setLotOnHand(lotId: string, quantity: number) { this.lots.find((lot) => lot.id === lotId)!.onHandQuantity = quantity; }
  async appendMovements(movements: InventoryMovementRecord[]) { this.movements.push(...movements); }
  async appendHistory(entry: InventoryReceiptHistoryEntry) { this.history.push(entry); }
  async findLastHistoryActor(receiptId: string, action: InventoryReceiptHistoryAction) { return this.history.filter((entry) => entry.receiptId === receiptId && entry.action === action).at(-1)?.actorPersonId ?? null; }
  async findHospitalWideRoleHolders(roleName: string) { return this.roleHolders.get(roleName) ?? []; }
  async saveOutbox(event: OutboxEvent) { this.outbox.push(event); }
  async appendAudit(event: AuditEvent) { this.audit.push(event); }
}
