import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthorizationError } from '../../../../lib/require-authorized';

const mocks = vi.hoisted(() => ({ requireActor: vi.fn(), postDelivery: vi.fn(), listReceipts: vi.fn() }));
vi.mock('../../../../lib/actor', () => ({ requireActor: mocks.requireActor }));
vi.mock('../../../../lib/database', () => ({ getSharedDatabase: () => ({}) }));
vi.mock('@backoffice/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@backoffice/core')>()),
  InventoryReceiptService: vi.fn(() => ({ postDelivery: mocks.postDelivery })),
  InventoryQueries: vi.fn(() => ({ listReceipts: mocks.listReceipts }))
}));

import { GET, POST } from './route';

afterEach(() => vi.clearAllMocks());
const officer = { personId: 'officer', roles: [{ name: 'inventory-officer', organizationId: null }] };
const post = (body: unknown) => POST(new Request('http://localhost/api/inventory/receipts', { method: 'POST', body: JSON.stringify(body) }));

describe('/api/inventory/receipts', () => {
  it('rejects a delivery without a session before touching receipts', async () => {
    mocks.requireActor.mockRejectedValue(new AuthorizationError(401));
    expect((await post({})).status).toBe(401);
    expect(mocks.postDelivery).not.toHaveBeenCalled();
  });

  it('posts as the signed-in officer and returns the reference only', async () => {
    mocks.requireActor.mockResolvedValue(officer);
    mocks.postDelivery.mockResolvedValue({ id: 'receipt-1', reference: 'RC-2569-0001', status: 'POSTED', documentNo: 'IV-1' });
    const body = { vendorId: 'vendor', receivedOn: '2026-10-25', lines: [] };

    const response = await post(body);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: 'receipt-1', reference: 'RC-2569-0001' });
    expect(mocks.postDelivery).toHaveBeenCalledWith(officer, body);
  });

  it('forbids a list to someone without inventory access', async () => {
    mocks.requireActor.mockResolvedValue({ personId: 'nurse', roles: [] });
    expect((await GET(new Request('http://localhost/api/inventory/receipts'))).status).toBe(403);
    expect(mocks.listReceipts).not.toHaveBeenCalled();
  });
});
