import { z } from 'zod';
import type { AccessSubject } from './access.ts';

export const INVENTORY_MODULE = 'inventory';

export const inventoryLimits = { maxLines: 200, maxQuantity: 1_000_000, maxUnitPrice: 10_000_000, maxFactor: 100_000, maxReorderPoint: 1_000_000, maxLabelsPerLot: 500 } as const;

export const inventoryUnitKindSchema = z.enum(['ISSUE', 'PURCHASE']);
export type InventoryUnitKind = z.infer<typeof inventoryUnitKindSchema>;
export type InventoryReceiptKind = 'OPENING' | 'DELIVERY';
export type InventoryReceiptStatus = 'DRAFT' | 'SUBMITTED' | 'CERTIFIED' | 'POSTED' | 'VOIDED';
export type InventoryMovementKind = 'OPENING' | 'RECEIPT' | 'RECEIPT_VOID';
export type InventoryReceiptHistoryAction = 'SUBMITTED' | 'RETURNED' | 'CERTIFIED' | 'POSTED' | 'VOIDED';

// The round trip refuses dates like 2026-02-30 that the pattern alone lets through to MariaDB.
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => { const date = new Date(`${value}T00:00:00Z`); return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value; });
const reasonSchema = z.string().trim().min(1).max(1000);

export const inventoryCategoryInputSchema = z.object({ name: z.string().trim().min(1).max(120), isActive: z.boolean() });
export type InventoryCategoryInput = z.input<typeof inventoryCategoryInputSchema>;

export const inventoryItemInputSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{1,30}$/),
  name: z.string().trim().min(1).max(200),
  categoryId: z.string().min(1),
  issueUnit: z.string().trim().min(1).max(30),
  purchaseUnit: z.string().trim().min(1).max(30),
  purchaseUnitFactor: z.number().int().min(1).max(inventoryLimits.maxFactor),
  reorderPoint: z.number().int().min(0).max(inventoryLimits.maxReorderPoint),
  tracksExpiry: z.boolean(),
  isActive: z.boolean()
});
export type InventoryItemInput = z.input<typeof inventoryItemInputSchema>;

// Lot labels start with "LT-", so a manufacturer barcode may not, or a scan could not tell them apart.
export const inventoryBarcodeInputSchema = z.object({
  barcode: z.string().trim().regex(/^[\x21-\x7E]{1,64}$/).refine((barcode) => !barcode.toUpperCase().startsWith('LT-'), { message: 'reserved for lot labels' }),
  unitKind: inventoryUnitKindSchema
});
export type InventoryBarcodeInput = z.input<typeof inventoryBarcodeInputSchema>;

export const inventoryVendorInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().max(30).default(''),
  address: z.string().trim().max(500).default(''),
  isActive: z.boolean()
});
export type InventoryVendorInput = z.input<typeof inventoryVendorInputSchema>;

export const receiptLineInputSchema = z.object({
  itemId: z.string().min(1),
  unitKind: inventoryUnitKindSchema,
  quantity: z.number().int().min(1).max(inventoryLimits.maxQuantity),
  unitPrice: z.number().min(0).max(inventoryLimits.maxUnitPrice),
  manufacturerLotNo: z.string().trim().max(60).optional(),
  expiryDate: isoDateSchema.optional()
});
export type ReceiptLineInput = z.input<typeof receiptLineInputSchema>;

export const postDeliveryInputSchema = z.object({
  vendorId: z.string().min(1),
  documentNo: z.string().trim().max(60).optional(),
  receivedOn: isoDateSchema,
  lines: z.array(receiptLineInputSchema).min(1).max(inventoryLimits.maxLines)
});
export type PostDeliveryInput = z.input<typeof postDeliveryInputSchema>;

/** Replaces every line of the draft opening balance. */
export const saveOpeningLinesInputSchema = z.object({ lines: z.array(receiptLineInputSchema).max(inventoryLimits.maxLines) });
export type SaveOpeningLinesInput = z.input<typeof saveOpeningLinesInputSchema>;

export const decideOpeningInputSchema = z.object({ decision: z.enum(['CERTIFY', 'RETURN']), reason: reasonSchema.optional() });
export type DecideOpeningInput = z.input<typeof decideOpeningInputSchema>;

export const voidReceiptInputSchema = z.object({ receiptId: z.string().min(1), reason: reasonSchema });
export type VoidReceiptInput = z.input<typeof voidReceiptInputSchema>;

export interface InventoryActor { personId: string; roles: AccessSubject['roles']; }
