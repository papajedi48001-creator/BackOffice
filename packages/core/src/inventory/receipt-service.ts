import { randomUUID } from 'node:crypto';
import { decideOpeningInputSchema, INVENTORY_MODULE, notificationEventPayloadSchema, postDeliveryInputSchema, saveOpeningLinesInputSchema, voidReceiptInputSchema, type DecideOpeningInput, type InventoryActor, type InventoryMovementKind, type InventoryReceiptHistoryAction, type PostDeliveryInput, type ReceiptLineInput, type SaveOpeningLinesInput, type VoidReceiptInput } from '@backoffice/contracts';
import { AuthorizationService } from '../access/authorization-service';
import { AuditService } from '../audit/audit-service';
import { canInventory, requireInventoryPermission } from './inventory-access';
import type { InventoryLotRecord, InventoryMovementRecord, InventoryReceiptLineRecord, InventoryReceiptRecord, InventoryRepository } from './inventory-repository';
import { bangkokDate, buddhistYear, computeLine, formatReference } from './quantities';

type AuditAction = 'inventory.opening.submitted' | 'inventory.opening.returned' | 'inventory.opening.certified' | 'inventory.receipt.posted' | 'inventory.receipt.voided';
const openingPath = '/inventory/opening';

export class InventoryReceiptService {
  constructor(
    private readonly repository: InventoryRepository,
    private readonly authorizer: AuthorizationService = new AuthorizationService(),
    private readonly createId: () => string = randomUUID,
    private readonly now: () => Date = () => new Date()
  ) {}

  async openOpening(actor: InventoryActor): Promise<InventoryReceiptRecord> {
    if (!canInventory(this.authorizer, actor, 'inventory.stock.receive') && !canInventory(this.authorizer, actor, 'inventory.opening.certify')) throw new Error('FORBIDDEN');
    return this.repository.transaction(async (repository) => {
      const existing = await repository.findOpeningForUpdate();
      if (existing) return existing;
      const now = this.now();
      const opening: InventoryReceiptRecord = {
        id: this.createId(), reference: formatReference('OB', buddhistYear(now), await repository.nextSequence('OB', buddhistYear(now))), kind: 'OPENING',
        vendorId: null, documentNo: null, receivedOn: bangkokDate(now), status: 'DRAFT', createdByPersonId: actor.personId, postedAt: null
      };
      await repository.insertReceipt(opening);
      return opening;
    });
  }

  async saveOpeningLines(actor: InventoryActor, input: SaveOpeningLinesInput): Promise<InventoryReceiptRecord> {
    requireInventoryPermission(this.authorizer, actor, 'inventory.stock.receive');
    const valid = saveOpeningLinesInputSchema.parse(input);
    return this.repository.transaction(async (repository) => {
      const opening = await this.lockedOpening(repository);
      if (opening.status !== 'DRAFT') throw new Error('OPENING_NOT_EDITABLE');
      await repository.replaceLines(opening.id, await this.buildLines(repository, opening.id, valid.lines, null));
      return opening;
    });
  }

  async submitOpening(actor: InventoryActor): Promise<InventoryReceiptRecord> {
    requireInventoryPermission(this.authorizer, actor, 'inventory.stock.receive');
    return this.repository.transaction(async (repository) => {
      const opening = await this.lockedOpening(repository);
      if (opening.status !== 'DRAFT') throw new Error('OPENING_NOT_EDITABLE');
      const lines = await repository.listLines(opening.id);
      if (lines.length === 0) throw new Error('EMPTY_RECEIPT');
      const submitted: InventoryReceiptRecord = { ...opening, status: 'SUBMITTED' };
      await repository.updateReceipt(opening.id, { status: 'SUBMITTED' });
      const historyId = await this.record(repository, submitted, actor, 'SUBMITTED', null, 'inventory.opening.submitted', lines.length);
      const supervisors = (await repository.findHospitalWideRoleHolders('inventory-supervisor')).filter((personId) => personId !== actor.personId);
      for (const personId of supervisors) await this.notify(repository, historyId, personId, `มียอดยกมารอรับรอง (${opening.reference})`);
      return submitted;
    });
  }

  async decideOpening(actor: InventoryActor, input: DecideOpeningInput): Promise<InventoryReceiptRecord> {
    requireInventoryPermission(this.authorizer, actor, 'inventory.opening.certify');
    const valid = decideOpeningInputSchema.parse(input);
    if (valid.decision === 'RETURN' && !valid.reason) throw new Error('REASON_REQUIRED');
    return this.repository.transaction(async (repository) => {
      const opening = await this.lockedOpening(repository);
      if (opening.status !== 'SUBMITTED') throw new Error('OPENING_NOT_SUBMITTED');
      const submitter = await repository.findLastHistoryActor(opening.id, 'SUBMITTED');
      const lines = await repository.listLines(opening.id);
      if (valid.decision === 'RETURN') {
        const returned: InventoryReceiptRecord = { ...opening, status: 'DRAFT' };
        await repository.updateReceipt(opening.id, { status: 'DRAFT' });
        const historyId = await this.record(repository, returned, actor, 'RETURNED', valid.reason!, 'inventory.opening.returned', lines.length);
        if (submitter) await this.notify(repository, historyId, submitter, `ยอดยกมาถูกส่งกลับแก้ไข (${opening.reference})`);
        return returned;
      }
      await this.recheckLines(repository, lines);
      const now = this.now();
      const certified: InventoryReceiptRecord = { ...opening, status: 'CERTIFIED', postedAt: now, receivedOn: bangkokDate(now) };
      await repository.updateReceipt(opening.id, { status: 'CERTIFIED', postedAt: now, receivedOn: certified.receivedOn });
      await this.createLots(repository, certified, lines, actor, 'OPENING', now);
      const historyId = await this.record(repository, certified, actor, 'CERTIFIED', null, 'inventory.opening.certified', lines.length);
      if (submitter) await this.notify(repository, historyId, submitter, `ยอดยกมาได้รับการรับรอง (${opening.reference})`);
      return certified;
    });
  }

  async postDelivery(actor: InventoryActor, input: PostDeliveryInput): Promise<InventoryReceiptRecord> {
    requireInventoryPermission(this.authorizer, actor, 'inventory.stock.receive');
    const valid = postDeliveryInputSchema.parse(input);
    return this.repository.transaction(async (repository) => {
      const opening = await repository.findOpeningForUpdate();
      if (!opening || opening.status !== 'CERTIFIED') throw new Error('OPENING_NOT_CERTIFIED');
      const now = this.now();
      if (valid.receivedOn > bangkokDate(now) || valid.receivedOn < opening.receivedOn) throw new Error('INVALID_RECEIVED_DATE');
      const vendor = await repository.findVendor(valid.vendorId);
      if (!vendor) throw new Error('VENDOR_NOT_FOUND');
      if (!vendor.isActive) throw new Error('VENDOR_INACTIVE');
      const id = this.createId();
      const lines = await this.buildLines(repository, id, valid.lines, valid.receivedOn);
      const receipt: InventoryReceiptRecord = {
        id, reference: formatReference('RC', buddhistYear(now), await repository.nextSequence('RC', buddhistYear(now))), kind: 'DELIVERY',
        vendorId: vendor.id, documentNo: valid.documentNo || null, receivedOn: valid.receivedOn, status: 'POSTED', createdByPersonId: actor.personId, postedAt: now
      };
      await repository.insertReceipt(receipt);
      await repository.replaceLines(id, lines);
      await this.createLots(repository, receipt, lines, actor, 'RECEIPT', now);
      await this.record(repository, receipt, actor, 'POSTED', null, 'inventory.receipt.posted', lines.length);
      return receipt;
    });
  }

  async voidDelivery(actor: InventoryActor, input: VoidReceiptInput): Promise<InventoryReceiptRecord> {
    requireInventoryPermission(this.authorizer, actor, 'inventory.stock.receive');
    const valid = voidReceiptInputSchema.parse(input);
    return this.repository.transaction(async (repository) => {
      const receipt = await repository.lockReceipt(valid.receiptId);
      if (!receipt) throw new Error('RECEIPT_NOT_FOUND');
      if (receipt.kind !== 'DELIVERY' || receipt.status !== 'POSTED') throw new Error('RECEIPT_NOT_VOIDABLE');
      const lots = await repository.lockLotsOfReceipt(receipt.id);
      if (lots.some((lot) => lot.onHandQuantity !== lot.receivedQuantity)) throw new Error('RECEIPT_NOT_VOIDABLE');
      const now = this.now();
      await repository.appendMovements(lots.map((lot) => this.movement(lot, 'RECEIPT_VOID', -lot.onHandQuantity, receipt.id, actor, now)));
      for (const lot of lots) await repository.setLotOnHand(lot.id, 0);
      const voided: InventoryReceiptRecord = { ...receipt, status: 'VOIDED' };
      await repository.updateReceipt(receipt.id, { status: 'VOIDED' });
      await this.record(repository, voided, actor, 'VOIDED', valid.reason, 'inventory.receipt.voided', lots.length);
      return voided;
    });
  }

  private async lockedOpening(repository: InventoryRepository): Promise<InventoryReceiptRecord> {
    const opening = await repository.findOpeningForUpdate();
    if (!opening) throw new Error('RECEIPT_NOT_FOUND');
    return opening;
  }

  /** `receivedOn` is null for the opening balance, whose stock may already be past its expiry date. */
  private async buildLines(repository: InventoryRepository, receiptId: string, inputs: ReceiptLineInput[], receivedOn: string | null): Promise<InventoryReceiptLineRecord[]> {
    const items = new Map((await repository.findItems([...new Set(inputs.map((line) => line.itemId))])).map((item) => [item.id, item]));
    return inputs.map((line, index) => {
      const item = checkedItem(items.get(line.itemId), line.expiryDate ?? null);
      if (receivedOn && line.expiryDate && line.expiryDate <= receivedOn) throw new Error('EXPIRY_IN_PAST');
      const computed = computeLine({ unitKind: line.unitKind, quantity: line.quantity, unitPrice: line.unitPrice, purchaseUnitFactor: item.purchaseUnitFactor });
      return {
        id: this.createId(), receiptId, lineNo: index + 1, itemId: item.id, enteredUnitKind: line.unitKind, enteredQuantity: line.quantity, enteredUnitPrice: line.unitPrice.toFixed(2),
        unitFactor: computed.unitFactor, issueQuantity: computed.issueQuantity, unitCost: computed.unitCost, lineTotal: computed.lineTotal,
        manufacturerLotNo: line.manufacturerLotNo || null, expiryDate: line.expiryDate ?? null
      };
    });
  }

  /** Draft lines were checked when saved; an item may have been closed or changed since. */
  private async recheckLines(repository: InventoryRepository, lines: InventoryReceiptLineRecord[]): Promise<void> {
    const items = new Map((await repository.findItems([...new Set(lines.map((line) => line.itemId))])).map((item) => [item.id, item]));
    for (const line of lines) checkedItem(items.get(line.itemId), line.expiryDate);
  }

  private async createLots(repository: InventoryRepository, receipt: InventoryReceiptRecord, lines: InventoryReceiptLineRecord[], actor: InventoryActor, kind: InventoryMovementKind, now: Date): Promise<void> {
    const lots: InventoryLotRecord[] = [];
    for (const line of lines) {
      lots.push({
        id: this.createId(), lotCode: formatReference('LT', buddhistYear(now), await repository.nextSequence('LT', buddhistYear(now))), itemId: line.itemId, receiptLineId: line.id,
        manufacturerLotNo: line.manufacturerLotNo, expiryDate: line.expiryDate, unitCost: line.unitCost, receivedQuantity: line.issueQuantity, onHandQuantity: line.issueQuantity, receivedAt: now
      });
    }
    await repository.insertLots(lots);
    await repository.appendMovements(lots.map((lot) => this.movement(lot, kind, lot.receivedQuantity, receipt.id, actor, now)));
  }

  private movement(lot: InventoryLotRecord, kind: InventoryMovementKind, quantity: number, receiptId: string, actor: InventoryActor, now: Date): InventoryMovementRecord {
    return { id: this.createId(), lotId: lot.id, itemId: lot.itemId, kind, quantity, unitCost: lot.unitCost, sourceType: 'inventory_receipt', sourceId: receiptId, actorPersonId: actor.personId, occurredAt: now };
  }

  // Returns the history entry id, which also keys the notifications of this step.
  private async record(repository: InventoryRepository, receipt: InventoryReceiptRecord, actor: InventoryActor, action: InventoryReceiptHistoryAction, reason: string | null, auditAction: AuditAction, lineCount: number): Promise<string> {
    const historyId = this.createId();
    await repository.appendHistory({ id: historyId, receiptId: receipt.id, action, actorPersonId: actor.personId, reason });
    await new AuditService({ append: (event) => repository.appendAudit(event) }, this.createId).recordAudit({
      actorPersonId: actor.personId, action: auditAction, targetType: 'inventory_receipt', targetId: receipt.id, result: 'SUCCESS',
      metadata: { reference: receipt.reference, status: receipt.status, lineCount }
    });
    return historyId;
  }

  private async notify(repository: InventoryRepository, historyId: string, recipientPersonId: string, subject: string): Promise<void> {
    const payload = notificationEventPayloadSchema.parse({ recipientPersonId, moduleCode: INVENTORY_MODULE, targetPath: openingPath, subject });
    await repository.saveOutbox({ id: this.createId(), type: 'notification.in_app', idempotencyKey: `notification.in_app:inventory:${historyId}:${recipientPersonId}`, payload, occurredAt: this.now().toISOString(), processedAt: null });
  }
}

function checkedItem<T extends { isActive: boolean; tracksExpiry: boolean }>(item: T | undefined, expiryDate: string | null): T {
  if (!item) throw new Error('ITEM_NOT_FOUND');
  if (!item.isActive) throw new Error('ITEM_INACTIVE');
  if (item.tracksExpiry && !expiryDate) throw new Error('EXPIRY_REQUIRED');
  if (!item.tracksExpiry && expiryDate) throw new Error('EXPIRY_NOT_ALLOWED');
  return item;
}
