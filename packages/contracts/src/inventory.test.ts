import { describe, expect, it } from 'vitest';
import { inventoryBarcodeInputSchema, inventoryItemInputSchema, postDeliveryInputSchema, receiptLineInputSchema } from './inventory';

const item = { code: 'AB-01', name: 'ถุงมือยาง', categoryId: 'category-1', issueUnit: 'ชิ้น', purchaseUnit: 'กล่อง', purchaseUnitFactor: 100, reorderPoint: 50, tracksExpiry: true, isActive: true };
const line = { itemId: 'item-1', unitKind: 'PURCHASE' as const, quantity: 2, unitPrice: 250 };

describe('inventory contracts', () => {
  it('upper-cases and trims an item code', () => {
    expect(inventoryItemInputSchema.parse({ ...item, code: ' ab-01 ' }).code).toBe('AB-01');
  });

  it('rejects an item code with characters outside A-Z, 0-9 and dash', () => {
    expect(inventoryItemInputSchema.safeParse({ ...item, code: 'AB 01' }).success).toBe(false);
  });

  it('rejects a barcode that looks like a lot code', () => {
    const result = inventoryBarcodeInputSchema.safeParse({ barcode: 'lt-2569-000001', unitKind: 'ISSUE' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.path).toEqual(['barcode']);
  });

  it('accepts a manufacturer barcode after trimming', () => {
    expect(inventoryBarcodeInputSchema.parse({ barcode: ' 8851234567890 ', unitKind: 'PURCHASE' }).barcode).toBe('8851234567890');
  });

  it('rejects a delivery with 201 lines', () => {
    const result = postDeliveryInputSchema.safeParse({ vendorId: 'vendor-1', receivedOn: '2026-10-22', lines: Array.from({ length: 201 }, () => line) });
    expect(result.success).toBe(false);
  });

  it.each([0, 1_000_001, 1.5])('rejects quantity %s', (quantity) => {
    expect(receiptLineInputSchema.safeParse({ ...line, quantity }).success).toBe(false);
  });

  it('rejects a negative unit price', () => {
    expect(receiptLineInputSchema.safeParse({ ...line, unitPrice: -1 }).success).toBe(false);
  });

  it('rejects a calendar date that does not exist', () => {
    expect(postDeliveryInputSchema.safeParse({ vendorId: 'vendor-1', receivedOn: '2026-02-30', lines: [line] }).success).toBe(false);
    expect(receiptLineInputSchema.safeParse({ ...line, expiryDate: '2028-02-29' }).success).toBe(true);
  });
});
