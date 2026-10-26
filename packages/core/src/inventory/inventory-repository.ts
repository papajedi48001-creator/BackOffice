import type { AuditEvent, InventoryMovementKind, InventoryReceiptHistoryAction, InventoryReceiptKind, InventoryReceiptStatus, InventoryUnitKind, OutboxEvent } from '@backoffice/contracts';
import type { InventoryItemRecord, InventoryVendorRecord } from './catalog-service';

export interface InventoryReceiptRecord { id: string; reference: string; kind: InventoryReceiptKind; vendorId: string | null; documentNo: string | null; receivedOn: string; status: InventoryReceiptStatus; createdByPersonId: string; postedAt: Date | null; }
export interface InventoryReceiptLineRecord { id: string; receiptId: string; lineNo: number; itemId: string; enteredUnitKind: InventoryUnitKind; enteredQuantity: number; enteredUnitPrice: string; unitFactor: number; issueQuantity: number; unitCost: string; lineTotal: string; manufacturerLotNo: string | null; expiryDate: string | null; }
export interface InventoryLotRecord { id: string; lotCode: string; itemId: string; receiptLineId: string; manufacturerLotNo: string | null; expiryDate: string | null; unitCost: string; receivedQuantity: number; onHandQuantity: number; receivedAt: Date; }
export interface InventoryMovementRecord { id: string; lotId: string; itemId: string; kind: InventoryMovementKind; quantity: number; unitCost: string; sourceType: 'inventory_receipt'; sourceId: string; actorPersonId: string; occurredAt: Date; }
export interface InventoryReceiptHistoryEntry { id: string; receiptId: string; action: InventoryReceiptHistoryAction; actorPersonId: string; reason: string | null; }

export interface InventoryRepository {
  transaction<T>(work: (repository: InventoryRepository) => Promise<T>): Promise<T>;
  /** Also serialises creation, so two people opening the page at once still get one opening balance. */
  findOpeningForUpdate(): Promise<InventoryReceiptRecord | null>;
  lockReceipt(receiptId: string): Promise<InventoryReceiptRecord | null>;
  insertReceipt(receipt: InventoryReceiptRecord): Promise<void>;
  updateReceipt(receiptId: string, patch: { status: InventoryReceiptStatus; postedAt?: Date; receivedOn?: string }): Promise<void>;
  replaceLines(receiptId: string, lines: InventoryReceiptLineRecord[]): Promise<void>;
  listLines(receiptId: string): Promise<InventoryReceiptLineRecord[]>;
  findItems(itemIds: string[]): Promise<InventoryItemRecord[]>;
  findVendor(vendorId: string): Promise<InventoryVendorRecord | null>;
  nextSequence(kind: 'RC' | 'OB' | 'LT', buddhistYear: number): Promise<number>;
  insertLots(lots: InventoryLotRecord[]): Promise<void>;
  lockLotsOfReceipt(receiptId: string): Promise<InventoryLotRecord[]>;
  setLotOnHand(lotId: string, quantity: number): Promise<void>;
  appendMovements(movements: InventoryMovementRecord[]): Promise<void>;
  appendHistory(entry: InventoryReceiptHistoryEntry): Promise<void>;
  findLastHistoryActor(receiptId: string, action: InventoryReceiptHistoryAction): Promise<string | null>;
  /** People holding `roleName` for the whole hospital, not for one unit. */
  findHospitalWideRoleHolders(roleName: string): Promise<string[]>;
  saveOutbox(event: OutboxEvent): Promise<void>;
  appendAudit(event: AuditEvent): Promise<void>;
}
