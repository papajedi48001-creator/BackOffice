// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readSession: vi.fn(), getSharedDatabase: vi.fn(), submit: vi.fn(), preview: vi.fn() }));
vi.mock('../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), LeaveService: class { submit = mocks.submit; preview = mocks.preview; } }));

import { POST } from './route';
import { POST as PREVIEW } from './preview/route';

const staff = { authenticated: true, personId: 'person-a', roles: [{ name: 'staff', organizationId: null }], dataOwnerModules: [] };
const body = { leaveTypeId: 'type-vacation', startDate: '2026-11-02', endDate: '2026-11-03', reason: 'พักผ่อน' };
const post = (handler: typeof POST, value: unknown) => handler(new Request('http://localhost/api/leave', { method: 'POST', body: JSON.stringify(value) }));

afterEach(() => vi.clearAllMocks());

describe('POST /api/leave', () => {
  it('rejects a signed-out user and answers 503 without a database', async () => {
    mocks.readSession.mockResolvedValueOnce(null);
    expect((await post(POST, body)).status).toBe(401);
    mocks.readSession.mockResolvedValueOnce(staff);
    mocks.getSharedDatabase.mockReturnValueOnce(null);
    expect((await post(POST, body)).status).toBe(503);
  });

  it('files as the signed-in person, never the body’s personId', async () => {
    mocks.readSession.mockResolvedValue(staff);
    mocks.getSharedDatabase.mockReturnValue({});
    mocks.submit.mockResolvedValueOnce({ ok: false, code: 'INSUFFICIENT_BALANCE' }).mockResolvedValueOnce({ ok: true, requestId: 'request-1', reference: 'REQ-request-1', warnings: [], medicalCertificateRequired: false });
    const refused = await post(POST, { ...body, personId: 'person-b' });
    expect(refused.status).toBe(400);
    await expect(refused.json()).resolves.toEqual({ error: 'INSUFFICIENT_BALANCE' });
    expect(mocks.submit).toHaveBeenCalledWith('person-a', { ...body, startHalf: 'FULL', endHalf: 'FULL', contactDuringLeave: undefined });
    expect((await post(POST, body)).status).toBe(201);
  });

  it('names the bad fields', async () => {
    mocks.readSession.mockResolvedValue(staff);
    mocks.getSharedDatabase.mockReturnValue({});
    const response = await post(POST, { ...body, endDate: '2026-11-01' });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'invalid_input', fields: ['endDate'] });
  });
});

describe('POST /api/leave/preview', () => {
  it('returns the preview for the signed-in person', async () => {
    mocks.readSession.mockResolvedValue(staff);
    mocks.getSharedDatabase.mockReturnValue({});
    mocks.preview.mockResolvedValue({ days: 2, balance: null, warnings: [], medicalCertificateRequired: false, error: null });
    const response = await post(PREVIEW, body);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ days: 2 });
    expect(mocks.preview.mock.calls[0]?.[0]).toBe('person-a');
    expect((await post(PREVIEW, {})).status).toBe(400);
  });
});
