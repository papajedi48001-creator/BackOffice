// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ requireAuthorized: vi.fn(), readRuntimeValue: vi.fn(), createDatabase: vi.fn(), submitRequest: vi.fn() }));
vi.mock('../../../lib/require-authorized', () => ({ requireAuthorized: mocks.requireAuthorized }));
vi.mock('../../../lib/runtime-env', () => ({ readRuntimeValue: mocks.readRuntimeValue }));
vi.mock('@backoffice/db', () => ({ createDatabase: mocks.createDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), RequestService: class { submitRequest = mocks.submitRequest; } }));

import { POST } from './route';

const submit = (body: object) => POST(new Request('http://localhost/api/requests', { method: 'POST', body: JSON.stringify(body) }));

function ready() {
  mocks.readRuntimeValue.mockReturnValue('mysql://example');
  mocks.requireAuthorized.mockResolvedValue({ authenticated: true, personId: 'person-a' });
  mocks.createDatabase.mockReturnValue({ query: vi.fn(), execute: vi.fn(), transaction: vi.fn(), close: vi.fn() });
}

afterEach(() => vi.clearAllMocks());

describe('POST /api/requests', () => {
  it('sends leave requests to the leave routes', async () => {
    ready();
    const response = await submit({ moduleCode: 'leave', organizationId: 'unit-a' });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'leave_request_route' });
    expect(mocks.submitRequest).not.toHaveBeenCalled();
  });

  it('submits other requests as the signed-in person', async () => {
    ready();
    mocks.submitRequest.mockResolvedValue({ id: 'request-1', status: 'IN_REVIEW', approvalSteps: [] });
    const response = await submit({ moduleCode: 'maintenance', organizationId: 'unit-a' });
    expect(response.status).toBe(201);
    expect(mocks.submitRequest).toHaveBeenCalledWith({ moduleCode: 'maintenance', requestorPersonId: 'person-a', organizationSnapshot: { organizationId: 'unit-a' } });
  });
});
