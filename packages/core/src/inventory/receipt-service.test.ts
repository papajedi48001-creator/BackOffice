import { describe, expect, it } from 'vitest';
import type { InventoryActor } from '@backoffice/contracts';
import { InMemoryInventoryRepository } from './in-memory-inventory-repository';
import { InventoryReceiptService } from './receipt-service';

const officer: InventoryActor = { personId: 'officer', roles: [{ name: 'inventory-officer', organizationId: null }] };
const supervisor: InventoryActor = { personId: 'supervisor', roles: [{ name: 'inventory-supervisor', organizationId: null }] };
const gloves = { id: 'gloves', code: 'AB-01', name: 'ถุงมือยาง', categoryId: 'medical', issueUnit: 'ชิ้น', purchaseUnit: 'กล่อง', purchaseUnitFactor: 100, reorderPoint: 50, tracksExpiry: true, isActive: true };
const paper = { id: 'paper', code: 'PA-01', name: 'กระดาษ A4', categoryId: 'office', issueUnit: 'รีม', purchaseUnit: 'กล่อง', purchaseUnitFactor: 5, reorderPoint: 10, tracksExpiry: false, isActive: true };

function setup(now = new Date('2026-10-22T03:00:00Z')) {
  const repository = new InMemoryInventoryRepository();
  repository.items.set(gloves.id, gloves);
  repository.items.set(paper.id, paper);
  repository.items.set('retired', { ...paper, id: 'retired', code: 'OLD-01', isActive: false });
  repository.vendors.set('vendor', { id: 'vendor', name: 'บริษัท เอ จำกัด', phone: '', address: '', isActive: true });
  repository.vendors.set('closed-vendor', { id: 'closed-vendor', name: 'ร้านเลิกกิจการ', phone: '', address: '', isActive: false });
  repository.roleHolders.set('inventory-supervisor', ['supervisor', 'supervisor-2']);
  let sequence = 0;
  const clock = { now };
  const service = new InventoryReceiptService(repository, undefined, () => `id-${++sequence}`, () => clock.now);
  return { repository, service, clock };
}

const glovesLine = { itemId: 'gloves', unitKind: 'PURCHASE' as const, quantity: 2, unitPrice: 250, expiryDate: '2027-06-30', manufacturerLotNo: 'M-77' };
const paperLine = { itemId: 'paper', unitKind: 'ISSUE' as const, quantity: 30, unitPrice: 120 };

async function certified(context = setup()) {
  await context.service.openOpening(officer);
  await context.service.saveOpeningLines(officer, { lines: [glovesLine, paperLine] });
  await context.service.submitOpening(officer);
  await context.service.decideOpening(supervisor, { decision: 'CERTIFY' });
  return context;
}

const delivery = (overrides: Record<string, unknown> = {}) => ({ vendorId: 'vendor', documentNo: 'IV-123', receivedOn: '2026-10-22', lines: [glovesLine], ...overrides });

describe('opening balance', () => {
  it('creates one opening draft and returns the same one afterwards', async () => {
    const { service } = setup();
    const first = await service.openOpening(officer);
    const again = await service.openOpening(supervisor);
    expect(first).toMatchObject({ reference: 'OB-2569-0001', kind: 'OPENING', status: 'DRAFT' });
    expect(again.id).toBe(first.id);
  });

  it('walks draft, return, resubmit and certify, creating lots only at certification', async () => {
    const { repository, service } = setup();
    await service.openOpening(officer);
    await service.saveOpeningLines(officer, { lines: [glovesLine, paperLine] });
    await service.submitOpening(officer);
    expect(repository.lots).toHaveLength(0);
    await service.decideOpening(supervisor, { decision: 'RETURN', reason: 'จำนวนถุงมือไม่ตรงกับบัญชี' });
    expect([...repository.receipts.values()][0]!.status).toBe('DRAFT');
    await service.submitOpening(officer);

    const result = await service.decideOpening(supervisor, { decision: 'CERTIFY' });

    expect(result.status).toBe('CERTIFIED');
    expect(repository.lots.map((lot) => [lot.lotCode, lot.itemId, lot.onHandQuantity, lot.unitCost, lot.expiryDate])).toEqual([
      ['LT-2569-000001', 'gloves', 200, '2.5000', '2027-06-30'],
      ['LT-2569-000002', 'paper', 30, '120.0000', null]
    ]);
    for (const lot of repository.lots) expect(repository.movements.filter((movement) => movement.lotId === lot.id).reduce((sum, movement) => sum + movement.quantity, 0)).toBe(lot.onHandQuantity);
    expect(repository.movements.every((movement) => movement.kind === 'OPENING')).toBe(true);
    expect(repository.history.map((entry) => entry.action)).toEqual(['SUBMITTED', 'RETURNED', 'SUBMITTED', 'CERTIFIED']);
  });

  it('refuses edits after submission', async () => {
    const { service } = setup();
    await service.openOpening(officer);
    await service.saveOpeningLines(officer, { lines: [paperLine] });
    await service.submitOpening(officer);
    await expect(service.saveOpeningLines(officer, { lines: [] })).rejects.toThrow('OPENING_NOT_EDITABLE');
  });

  it('refuses to submit an empty opening balance', async () => {
    const { service } = setup();
    await service.openOpening(officer);
    await expect(service.submitOpening(officer)).rejects.toThrow('EMPTY_RECEIPT');
  });

  it('requires a reason to send it back', async () => {
    const { service } = setup();
    await service.openOpening(officer);
    await service.saveOpeningLines(officer, { lines: [paperLine] });
    await service.submitOpening(officer);
    await expect(service.decideOpening(supervisor, { decision: 'RETURN' })).rejects.toThrow('REASON_REQUIRED');
  });

  it('lets only a supervisor certify', async () => {
    const { service } = setup();
    await service.openOpening(officer);
    await service.saveOpeningLines(officer, { lines: [paperLine] });
    await service.submitOpening(officer);
    await expect(service.decideOpening(officer, { decision: 'CERTIFY' })).rejects.toThrow('FORBIDDEN');
  });

  it('checks the saved lines again at certification, after the catalogue may have changed', async () => {
    const { repository, service } = setup();
    await service.openOpening(officer);
    await service.saveOpeningLines(officer, { lines: [glovesLine, paperLine] });
    await service.submitOpening(officer);
    repository.items.set('paper', { ...paper, tracksExpiry: true });
    await expect(service.decideOpening(supervisor, { decision: 'CERTIFY' })).rejects.toThrow('EXPIRY_REQUIRED');
    repository.items.set('paper', { ...paper, isActive: false });
    await expect(service.decideOpening(supervisor, { decision: 'CERTIFY' })).rejects.toThrow('ITEM_INACTIVE');
    expect(repository.lots).toHaveLength(0);
  });

  it('refuses a decision when nothing is waiting', async () => {
    const { service } = setup();
    await service.openOpening(officer);
    await expect(service.decideOpening(supervisor, { decision: 'CERTIFY' })).rejects.toThrow('OPENING_NOT_SUBMITTED');
  });

  it('tells supervisors and then the submitter, without the reason', async () => {
    const { repository, service } = setup();
    repository.roleHolders.set('inventory-supervisor', ['supervisor', 'officer']);
    await service.openOpening(officer);
    await service.saveOpeningLines(officer, { lines: [paperLine] });
    await service.submitOpening(officer);
    await service.decideOpening(supervisor, { decision: 'RETURN', reason: 'จำนวนถุงมือไม่ตรงกับบัญชี' });

    expect(repository.outbox.map((event) => event.payload)).toEqual([
      { recipientPersonId: 'supervisor', moduleCode: 'inventory', targetPath: '/inventory/opening', subject: 'มียอดยกมารอรับรอง (OB-2569-0001)' },
      { recipientPersonId: 'officer', moduleCode: 'inventory', targetPath: '/inventory/opening', subject: 'ยอดยกมาถูกส่งกลับแก้ไข (OB-2569-0001)' }
    ]);
    expect(repository.outbox[0]!.idempotencyKey).toMatch(/^notification\.in_app:inventory:id-\d+:supervisor$/);
    const everything = JSON.stringify([repository.outbox, repository.audit]);
    expect(everything).not.toContain('จำนวนถุงมือ');
  });
});

describe('delivery receipts', () => {
  it('refuses a delivery before the opening balance is certified', async () => {
    const { service } = setup();
    await expect(service.postDelivery(officer, delivery())).rejects.toThrow('OPENING_NOT_CERTIFIED');
  });

  it('posts a delivery, converting boxes to pieces and creating a lot', async () => {
    const { repository, service } = await certified();
    const noticesBefore = repository.outbox.length;
    const receipt = await service.postDelivery(officer, delivery());

    expect(receipt).toMatchObject({ reference: 'RC-2569-0001', status: 'POSTED', vendorId: 'vendor', documentNo: 'IV-123' });
    const lot = repository.lots.at(-1)!;
    expect(lot).toMatchObject({ lotCode: 'LT-2569-000003', onHandQuantity: 200, receivedQuantity: 200, unitCost: '2.5000', manufacturerLotNo: 'M-77' });
    expect(repository.movements.at(-1)).toMatchObject({ kind: 'RECEIPT', quantity: 200, lotId: lot.id, sourceType: 'inventory_receipt', sourceId: receipt.id });
    const audit = repository.audit.at(-1)!;
    expect(audit.action).toBe('inventory.receipt.posted');
    expect(JSON.parse(audit.metadata)).toEqual({ reference: 'RC-2569-0001', status: 'POSTED', lineCount: 1 });
    expect(repository.outbox).toHaveLength(noticesBefore);
  });

  it('accepts today in Bangkok while UTC is still yesterday, and refuses tomorrow', async () => {
    const context = setup(new Date('2026-10-21T17:30:00Z'));
    await certified(context);
    await expect(context.service.postDelivery(officer, delivery({ receivedOn: '2026-10-22' }))).resolves.toMatchObject({ status: 'POSTED' });
    await expect(context.service.postDelivery(officer, delivery({ receivedOn: '2026-10-23' }))).rejects.toThrow('INVALID_RECEIVED_DATE');
  });

  it('refuses a received date before the opening balance', async () => {
    const { service } = await certified();
    await expect(service.postDelivery(officer, delivery({ receivedOn: '2026-10-21' }))).rejects.toThrow('INVALID_RECEIVED_DATE');
  });

  it.each([
    [{ ...glovesLine, expiryDate: undefined }, 'EXPIRY_REQUIRED'],
    [{ ...paperLine, expiryDate: '2027-01-01' }, 'EXPIRY_NOT_ALLOWED'],
    [{ ...glovesLine, expiryDate: '2026-10-22' }, 'EXPIRY_IN_PAST'],
    [{ ...paperLine, itemId: 'retired' }, 'ITEM_INACTIVE'],
    [{ ...paperLine, itemId: 'missing' }, 'ITEM_NOT_FOUND'],
    [{ ...paperLine, unitPrice: 1.234 }, 'INVALID_LINE']
  ])('refuses a bad line (%#)', async (line, code) => {
    const { service } = await certified();
    await expect(service.postDelivery(officer, delivery({ lines: [line] }))).rejects.toThrow(code);
  });

  it('refuses a closed vendor', async () => {
    const { service } = await certified();
    await expect(service.postDelivery(officer, delivery({ vendorId: 'closed-vendor' }))).rejects.toThrow('VENDOR_INACTIVE');
  });

  it('refuses a supervisor posting a delivery', async () => {
    const { service } = await certified();
    await expect(service.postDelivery(supervisor, delivery())).rejects.toThrow('FORBIDDEN');
  });

  it('voids an untouched delivery back to zero', async () => {
    const { repository, service } = await certified();
    const receipt = await service.postDelivery(officer, delivery({ lines: [glovesLine, paperLine] }));

    const voided = await service.voidDelivery(officer, { receiptId: receipt.id, reason: 'บันทึกซ้ำ' });

    expect(voided.status).toBe('VOIDED');
    const lots = repository.lots.slice(-2);
    expect(lots.map((lot) => lot.onHandQuantity)).toEqual([0, 0]);
    expect(repository.movements.slice(-2).map((movement) => [movement.kind, movement.quantity])).toEqual([['RECEIPT_VOID', -200], ['RECEIPT_VOID', -30]]);
    expect(repository.history.at(-1)).toMatchObject({ action: 'VOIDED', reason: 'บันทึกซ้ำ' });
    expect(repository.audit.at(-1)!.metadata).not.toContain('บันทึกซ้ำ');
  });

  it('refuses to void once any lot has moved', async () => {
    const { repository, service } = await certified();
    const receipt = await service.postDelivery(officer, delivery());
    repository.lots.at(-1)!.onHandQuantity = 150;
    await expect(service.voidDelivery(officer, { receiptId: receipt.id, reason: 'บันทึกซ้ำ' })).rejects.toThrow('RECEIPT_NOT_VOIDABLE');
  });

  it('refuses to void twice or to void the opening balance', async () => {
    const { repository, service } = await certified();
    const receipt = await service.postDelivery(officer, delivery());
    await service.voidDelivery(officer, { receiptId: receipt.id, reason: 'บันทึกซ้ำ' });
    await expect(service.voidDelivery(officer, { receiptId: receipt.id, reason: 'อีกครั้ง' })).rejects.toThrow('RECEIPT_NOT_VOIDABLE');
    const opening = [...repository.receipts.values()].find((candidate) => candidate.kind === 'OPENING')!;
    await expect(service.voidDelivery(officer, { receiptId: opening.id, reason: 'ลอง' })).rejects.toThrow('RECEIPT_NOT_VOIDABLE');
  });

  it('requires a reason to void', async () => {
    const { service } = await certified();
    const receipt = await service.postDelivery(officer, delivery());
    await expect(service.voidDelivery(officer, { receiptId: receipt.id, reason: ' ' })).rejects.toThrow();
  });
});
