import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ requireActor: vi.fn(), voidDelivery: vi.fn() }));
vi.mock('../../../../../../lib/actor', () => ({ requireActor: mocks.requireActor }));
vi.mock('../../../../../../lib/database', () => ({ getSharedDatabase: () => ({}) }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...(await importOriginal<typeof import('@backoffice/core')>()), InventoryReceiptService: vi.fn(() => ({ voidDelivery: mocks.voidDelivery })) }));

import { POST } from './route';

afterEach(() => vi.clearAllMocks());
const officer = { personId: 'officer', roles: [{ name: 'inventory-officer', organizationId: null }] };
const voidReceipt = (body: unknown) => POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ receiptId: 'receipt-1' }) });

describe('POST /api/inventory/receipts/:receiptId/void', () => {
  it('voids the receipt in the URL and does not echo the reason', async () => {
    mocks.requireActor.mockResolvedValue(officer);
    mocks.voidDelivery.mockResolvedValue({ id: 'receipt-1', reference: 'RC-2569-0001', status: 'VOIDED' });

    const response = await voidReceipt({ receiptId: 'other', reason: 'บันทึกซ้ำ' });

    expect(response.status).toBe(200);
    expect(mocks.voidDelivery).toHaveBeenCalledWith(officer, { receiptId: 'receipt-1', reason: 'บันทึกซ้ำ' });
    expect(JSON.stringify(await response.json())).not.toContain('บันทึกซ้ำ');
  });

  it('answers 409 when stock has moved', async () => {
    mocks.requireActor.mockResolvedValue(officer);
    mocks.voidDelivery.mockRejectedValue(new Error('RECEIPT_NOT_VOIDABLE'));
    expect((await voidReceipt({ reason: 'ซ้ำ' })).status).toBe(409);
  });

  it('passes a null body on to validation instead of crashing', async () => {
    mocks.requireActor.mockResolvedValue(officer);
    mocks.voidDelivery.mockRejectedValue(new Error('INVALID_INPUT'));
    await voidReceipt(null);
    expect(mocks.voidDelivery).toHaveBeenCalledWith(officer, { receiptId: 'receipt-1', reason: undefined });
  });
});
