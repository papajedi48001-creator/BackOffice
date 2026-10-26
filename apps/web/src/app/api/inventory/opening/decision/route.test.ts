import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ requireActor: vi.fn(), decideOpening: vi.fn() }));
vi.mock('../../../../../lib/actor', () => ({ requireActor: mocks.requireActor }));
vi.mock('../../../../../lib/database', () => ({ getSharedDatabase: () => ({}) }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...(await importOriginal<typeof import('@backoffice/core')>()), InventoryReceiptService: vi.fn(() => ({ decideOpening: mocks.decideOpening })) }));

import { POST } from './route';

afterEach(() => vi.clearAllMocks());
const supervisor = { personId: 'supervisor', roles: [{ name: 'inventory-supervisor', organizationId: null }] };
const decide = (body: unknown) => POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) }));

describe('POST /api/inventory/opening/decision', () => {
  it('passes the decision to the service', async () => {
    mocks.requireActor.mockResolvedValue(supervisor);
    mocks.decideOpening.mockResolvedValue({ id: 'opening', reference: 'OB-2569-0001', status: 'CERTIFIED' });
    const response = await decide({ decision: 'CERTIFY' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: 'opening', reference: 'OB-2569-0001', status: 'CERTIFIED' });
    expect(mocks.decideOpening).toHaveBeenCalledWith(supervisor, { decision: 'CERTIFY' });
  });

  it('answers 409 when nothing is waiting for certification', async () => {
    mocks.requireActor.mockResolvedValue(supervisor);
    mocks.decideOpening.mockRejectedValue(new Error('OPENING_NOT_SUBMITTED'));
    expect((await decide({ decision: 'CERTIFY' })).status).toBe(409);
  });
});
