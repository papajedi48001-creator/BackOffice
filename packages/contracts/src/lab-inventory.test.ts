import { describe, expect, it } from 'vitest';
import { permissionModules } from './access.ts';
import { grantableRoleSchema, testerModuleCodes } from './admin.ts';
import { lineAlertModuleCodes } from './line.ts';
import { labDecisionInputSchema, labIssueInputSchema, labItemInputSchema, labMemberInputSchema, labReceiptInputSchema, labRequisitionInputSchema, labUsageInputSchema, LAB_MODULE } from './lab-inventory.ts';

const uuid = '0b6f3c1e-5d1a-4c8e-9a51-2f7c1d9e8b10';
const uuid2 = '1b6f3c1e-5d1a-4c8e-9a51-2f7c1d9e8b10';
const line = { itemId: uuid, lotNo: 'L001', expiryDate: '2027-01-31', quantityReceive: 2, pricePerReceive: 1250 };
const receipt = { receivedOn: '2026-11-10', vendorId: uuid, invoiceNo: 'INV-1', lines: [line] };

describe('lab-inventory module wiring', () => {
  it('maps lab.manage to the module and adds the manager, tester and LINE codes', () => {
    expect(LAB_MODULE).toBe('lab-inventory');
    expect(permissionModules['lab.manage']).toBe('lab-inventory');
    expect(grantableRoleSchema.safeParse('lab-manager').success).toBe(true);
    expect(grantableRoleSchema.safeParse('lab-inventory-tester').success).toBe(true);
    expect(testerModuleCodes).toContain('lab-inventory');
    expect(lineAlertModuleCodes).toContain('lab-inventory');
  });
});

describe('labMemberInputSchema', () => {
  it('needs at least one section for STAFF and none for HEAD or KEEPER', () => {
    expect(labMemberInputSchema.safeParse({ personId: uuid, role: 'STAFF', sectionIds: [uuid] }).success).toBe(true);
    expect(labMemberInputSchema.safeParse({ personId: uuid, role: 'STAFF', sectionIds: [] }).success).toBe(false);
    expect(labMemberInputSchema.safeParse({ personId: uuid, role: 'HEAD', sectionIds: [uuid] }).success).toBe(false);
    expect(labMemberInputSchema.safeParse({ personId: uuid, role: 'KEEPER', sectionIds: [] }).success).toBe(true);
  });
});

describe('labItemInputSchema', () => {
  it('defaults expiry warning to 90 days and rejects a zero factor', () => {
    const item = { code: 'CBC-01', name: 'น้ำยา CBC', receiveUnit: 'กล่อง', useUnit: 'ขวด', unitsPerReceive: 10, isActive: true, reorderPoints: [] };
    expect(labItemInputSchema.parse(item)).toMatchObject({ expiryWarnDays: 90 });
    expect(labItemInputSchema.safeParse({ ...item, unitsPerReceive: 0 }).success).toBe(false);
    expect(labItemInputSchema.safeParse({ ...item, code: 'มี space' }).success).toBe(false);
  });
});

describe('labReceiptInputSchema', () => {
  it('accepts a receipt and rejects no lines, three decimals and unknown keys', () => {
    expect(labReceiptInputSchema.safeParse(receipt).success).toBe(true);
    expect(labReceiptInputSchema.safeParse({ ...receipt, lines: [] }).success).toBe(false);
    expect(labReceiptInputSchema.safeParse({ ...receipt, lines: [{ ...line, pricePerReceive: 1.234 }] }).success).toBe(false);
    expect(labReceiptInputSchema.safeParse({ ...receipt, extra: 1 }).success).toBe(false);
    expect(labReceiptInputSchema.safeParse({ ...receipt, receivedOn: '10/11/2026' }).success).toBe(false);
  });
});

describe('labDecisionInputSchema', () => {
  it('needs a reason to return or reject but not to approve', () => {
    expect(labDecisionInputSchema.safeParse({ decision: 'APPROVE', reason: '' }).success).toBe(true);
    expect(labDecisionInputSchema.safeParse({ decision: 'REJECT', reason: ' ' }).success).toBe(false);
    expect(labDecisionInputSchema.safeParse({ decision: 'RETURN', reason: 'ขอลดจำนวน' }).success).toBe(true);
  });
});

describe('requisition, issue and usage inputs', () => {
  it('rejects a requisition with the same item twice', () => {
    expect(labRequisitionInputSchema.safeParse({ sectionId: uuid, note: '', lines: [{ itemId: uuid, quantity: 1 }, { itemId: uuid2, quantity: 2 }] }).success).toBe(true);
    expect(labRequisitionInputSchema.safeParse({ sectionId: uuid, note: '', lines: [{ itemId: uuid, quantity: 1 }, { itemId: uuid, quantity: 2 }] }).success).toBe(false);
  });
  it('accepts an issue with an empty pick list (nothing issued for that line)', () => {
    expect(labIssueInputSchema.safeParse({ note: 'ของหมด', lines: [{ lineId: uuid, picks: [] }] }).success).toBe(true);
  });
  it('accepts FEFO usage (picks null) and rejects quantity 0', () => {
    const usage = { storeId: uuid, itemId: uuid, quantity: 3, usageTypeId: uuid, entryDate: '2026-11-10', note: '', picks: null };
    expect(labUsageInputSchema.safeParse(usage).success).toBe(true);
    expect(labUsageInputSchema.safeParse({ ...usage, quantity: 0 }).success).toBe(false);
  });
});
