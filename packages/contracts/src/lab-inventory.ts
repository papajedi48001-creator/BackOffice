import { z } from 'zod';

/** ระบบรายงานวัสดุคงคลัง Lab: the module code used by the registry, the gate, notices and LINE routing. Separate from `inventory`. */
export const LAB_MODULE = 'lab-inventory';

/** บทบาทในโมดูล: หัวหน้า Lab, ผู้ดูแลคลัง Lab, เจ้าหน้าที่ Lab. */
export const labMemberRoleSchema = z.enum(['HEAD', 'KEEPER', 'STAFF']);
export type LabMemberRole = z.infer<typeof labMemberRoleSchema>;

export const labMovementKindSchema = z.enum(['OPENING', 'RECEIPT', 'RECEIPT_VOID', 'ISSUE_OUT', 'ISSUE_IN', 'USE', 'USE_REVERSAL', 'ADJUSTMENT']);
export type LabMovementKind = z.infer<typeof labMovementKindSchema>;

export const labRequisitionStatusSchema = z.enum(['SUBMITTED', 'RETURNED', 'REJECTED', 'APPROVED', 'ISSUED', 'CANCELLED']);
export type LabRequisitionStatus = z.infer<typeof labRequisitionStatusSchema>;

export const labOpeningStatusSchema = z.enum(['DRAFT', 'SUBMITTED', 'CERTIFIED']);
export type LabOpeningStatus = z.infer<typeof labOpeningStatusSchema>;

const id = z.string().uuid();
const text = (max: number) => z.string().trim().max(max);
const name = (max: number) => z.string().trim().min(1).max(max);
const qty = z.number().int().min(1).max(1_000_000);

/** A Bangkok calendar date, `YYYY-MM-DD`. */
export const labDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value), 'invalid date');

export const labItemInputSchema = z.object({
  code: z.string().trim().regex(/^[A-Za-z0-9-]{1,30}$/),
  name: name(200),
  receiveUnit: name(30),
  useUnit: name(30),
  unitsPerReceive: z.number().int().min(1).max(100_000),
  expiryWarnDays: z.number().int().min(0).max(3650).default(90),
  isActive: z.boolean(),
  reorderPoints: z.array(z.object({ storeId: id, reorderPoint: z.number().int().min(0).max(1_000_000) }).strict()).max(50).default([])
}).strict();
export type LabItemInput = z.input<typeof labItemInputSchema>;

export const labSectionInputSchema = z.object({ code: z.string().trim().regex(/^[A-Z0-9-]{1,20}$/), name: name(80), sortOrder: z.number().int().min(0).max(9999), isActive: z.boolean() }).strict();
export type LabSectionInput = z.infer<typeof labSectionInputSchema>;

export const labVendorInputSchema = z.object({ name: name(200), phone: text(40).default(''), isActive: z.boolean() }).strict();
export type LabVendorInput = z.input<typeof labVendorInputSchema>;

export const labUsageTypeInputSchema = z.object({ name: name(60), sortOrder: z.number().int().min(0).max(9999), isActive: z.boolean() }).strict();
export type LabUsageTypeInput = z.infer<typeof labUsageTypeInputSchema>;

export const labMemberInputSchema = z.object({ personId: id, role: labMemberRoleSchema, sectionIds: z.array(id).max(20) }).strict()
  .refine((member) => (member.role === 'STAFF' ? member.sectionIds.length >= 1 : member.sectionIds.length === 0), { message: 'STAFF needs a section, HEAD and KEEPER none', path: ['sectionIds'] });
export type LabMemberInput = z.infer<typeof labMemberInputSchema>;

const twoDecimals = (value: number) => Math.abs(Math.round(value * 100) - value * 100) < 1e-6;

export const labReceiptLineInputSchema = z.object({
  itemId: id,
  lotNo: name(60),
  expiryDate: labDateSchema.nullable(),
  quantityReceive: qty,
  pricePerReceive: z.number().min(0).max(9_999_999_999.99).refine(twoDecimals, 'at most 2 decimals')
}).strict();

export const labReceiptInputSchema = z.object({ receivedOn: labDateSchema, vendorId: id, invoiceNo: text(60).default(''), lines: z.array(labReceiptLineInputSchema).min(1).max(100) }).strict();
export type LabReceiptInput = z.input<typeof labReceiptInputSchema>;

const uniqueItems = (lines: { itemId: string }[]) => new Set(lines.map((line) => line.itemId)).size === lines.length;

export const labRequisitionInputSchema = z.object({
  sectionId: id,
  note: text(500).default(''),
  lines: z.array(z.object({ itemId: id, quantity: qty }).strict()).min(1).max(100).refine(uniqueItems, 'each item once')
}).strict();
export type LabRequisitionInput = z.input<typeof labRequisitionInputSchema>;

export const labDecisionInputSchema = z.object({ decision: z.enum(['APPROVE', 'RETURN', 'REJECT']), reason: text(1000).default('') }).strict()
  .refine((input) => input.decision === 'APPROVE' || input.reason.length > 0, { message: 'reason required', path: ['reason'] });
export type LabDecisionInput = z.input<typeof labDecisionInputSchema>;

const pick = z.object({ lotId: id, quantity: qty }).strict();
export type LabPick = z.infer<typeof pick>;

export const labIssueInputSchema = z.object({ note: text(500).default(''), lines: z.array(z.object({ lineId: id, picks: z.array(pick).max(20) }).strict()).min(1).max(100) }).strict();
export type LabIssueInput = z.input<typeof labIssueInputSchema>;

export const labUsageInputSchema = z.object({
  storeId: id, itemId: id, quantity: qty, usageTypeId: id, entryDate: labDateSchema, note: text(500).default(''),
  picks: z.array(pick).min(1).max(20).nullable().default(null)
}).strict();
export type LabUsageInput = z.input<typeof labUsageInputSchema>;

export const labReasonInputSchema = z.object({ reason: name(1000) }).strict();
export type LabReasonInput = z.infer<typeof labReasonInputSchema>;

export const labOpeningLineInputSchema = z.object({ storeId: id, itemId: id, lotNo: name(60), expiryDate: labDateSchema.nullable(), quantity: qty, unitCost: z.number().min(0).max(9_999_999_999) }).strict();
export type LabOpeningLineInput = z.infer<typeof labOpeningLineInputSchema>;

export const labOpeningDecisionInputSchema = z.object({ decision: z.enum(['CERTIFY', 'RETURN']), reason: text(1000).default('') }).strict()
  .refine((input) => input.decision === 'CERTIFY' || input.reason.length > 0, { message: 'reason required', path: ['reason'] });
export type LabOpeningDecisionInput = z.input<typeof labOpeningDecisionInputSchema>;
