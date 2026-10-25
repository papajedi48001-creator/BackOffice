import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ requireActor: vi.fn(), resolveScan: vi.fn() }));
vi.mock('../../../../lib/actor', () => ({ requireActor: mocks.requireActor }));
vi.mock('../../../../lib/database', () => ({ getSharedDatabase: () => ({}) }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...(await importOriginal<typeof import('@backoffice/core')>()), InventoryQueries: vi.fn(() => ({ resolveScan: mocks.resolveScan })) }));

import { GET } from './route';

afterEach(() => vi.clearAllMocks());
const scan = (code: string) => GET(new Request(`http://localhost/api/inventory/scan?code=${encodeURIComponent(code)}`));

describe('GET /api/inventory/scan', () => {
  it('forbids someone with no inventory role before looking anything up', async () => {
    mocks.requireActor.mockResolvedValue({ personId: 'nurse', roles: [] });
    expect((await scan('8851234567890')).status).toBe(403);
    expect(mocks.resolveScan).not.toHaveBeenCalled();
  });

  it('answers 404 for an unknown code', async () => {
    mocks.requireActor.mockResolvedValue({ personId: 'supervisor', roles: [{ name: 'inventory-supervisor', organizationId: null }] });
    mocks.resolveScan.mockResolvedValue(null);
    const response = await scan('X1');
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'CODE_NOT_FOUND' });
  });

  it('returns what the code points at', async () => {
    mocks.requireActor.mockResolvedValue({ personId: 'officer', roles: [{ name: 'inventory-officer', organizationId: null }] });
    mocks.resolveScan.mockResolvedValue({ kind: 'item', item: { id: 'item-1' } });
    const response = await scan(' ab-01 ');
    expect(await response.json()).toEqual({ kind: 'item', item: { id: 'item-1' } });
    expect(mocks.resolveScan).toHaveBeenCalledWith(' ab-01 ');
  });
});
