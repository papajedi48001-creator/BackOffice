// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readSession: vi.fn(), getSharedDatabase: vi.fn(), resubmit: vi.fn(), resubmitCancelDays: vi.fn(), cancelPending: vi.fn(), requestCancelDays: vi.fn() }));
vi.mock('../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), LeaveService: class { resubmit = mocks.resubmit; resubmitCancelDays = mocks.resubmitCancelDays; cancelPending = mocks.cancelPending; requestCancelDays = mocks.requestCancelDays; } }));

import { PUT } from './route';
import { POST as CANCEL } from './cancellation/route';
import { POST as CANCEL_DAYS } from './cancel-days/route';

const staff = { authenticated: true, personId: 'person-a', roles: [], dataOwnerModules: [] };
const params = { params: Promise.resolve({ requestId: 'request-1' }) };
const call = (handler: (request: Request, context: typeof params) => Promise<Response>, value: unknown, method = 'POST') => handler(new Request('http://localhost/api/leave/request-1', { method, body: JSON.stringify(value) }), params);

afterEach(() => vi.clearAllMocks());

describe('leave request actions', () => {
  it('rejects a signed-out user', async () => {
    mocks.readSession.mockResolvedValue(null);
    expect((await call(PUT, {}, 'PUT')).status).toBe(401);
    expect((await call(CANCEL, {})).status).toBe(401);
    expect((await call(CANCEL_DAYS, {})).status).toBe(401);
  });

  it('resubmits a returned ใบลา and maps NOT_FOUND to 404', async () => {
    mocks.readSession.mockResolvedValue(staff);
    mocks.getSharedDatabase.mockReturnValue({});
    mocks.resubmit.mockResolvedValueOnce({ ok: true, warnings: [], medicalCertificateRequired: false }).mockResolvedValueOnce({ ok: false, code: 'NOT_FOUND' });
    const body = { leaveTypeId: 'type-vacation', startDate: '2026-11-02', endDate: '2026-11-03', reason: 'พักผ่อน' };
    expect((await call(PUT, body, 'PUT')).status).toBe(200);
    expect(mocks.resubmit.mock.calls[0]?.slice(0, 2)).toEqual(['person-a', 'request-1']);
    expect((await call(PUT, body, 'PUT')).status).toBe(404);
    expect((await call(PUT, { ...body, reason: '' }, 'PUT')).status).toBe(400);
  });

  it('resubmits a returned ขอยกเลิกวันลา when the body has no ประเภทการลา', async () => {
    mocks.readSession.mockResolvedValue(staff);
    mocks.getSharedDatabase.mockReturnValue({});
    mocks.resubmitCancelDays.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false, code: 'NOT_FOUND' });
    const body = { startDate: '2026-11-03', endDate: '2026-11-03', reason: 'กลับมาทำงาน', personId: 'someone-else' };
    expect((await call(PUT, body, 'PUT')).status).toBe(200);
    expect(mocks.resubmitCancelDays).toHaveBeenCalledWith('person-a', 'request-1', { startDate: '2026-11-03', endDate: '2026-11-03', startHalf: 'FULL', endHalf: 'FULL', reason: 'กลับมาทำงาน' });
    expect(mocks.resubmit).not.toHaveBeenCalled();
    expect((await call(PUT, body, 'PUT')).status).toBe(404);
    expect((await call(PUT, { ...body, reason: '' }, 'PUT')).status).toBe(400);
  });

  it('cancels a pending ใบลา with a reason', async () => {
    mocks.readSession.mockResolvedValue(staff);
    mocks.getSharedDatabase.mockReturnValue({});
    mocks.cancelPending.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false, code: 'NOT_PENDING' });
    expect((await call(CANCEL, { reason: 'เปลี่ยนแผน' })).status).toBe(200);
    expect(mocks.cancelPending).toHaveBeenCalledWith('person-a', 'request-1', 'เปลี่ยนแผน');
    expect((await call(CANCEL, { reason: 'เปลี่ยนแผน' })).status).toBe(409);
    expect((await call(CANCEL, {})).status).toBe(400);
  });

  it('files ขอยกเลิกวันลา', async () => {
    mocks.readSession.mockResolvedValue(staff);
    mocks.getSharedDatabase.mockReturnValue({});
    mocks.requestCancelDays.mockResolvedValueOnce({ ok: true, requestId: 'cancel-1' }).mockResolvedValueOnce({ ok: false, code: 'OUTSIDE_LEAVE' });
    const body = { startDate: '2026-11-03', endDate: '2026-11-03', reason: 'กลับมาทำงาน' };
    const created = await call(CANCEL_DAYS, body);
    expect(created.status).toBe(201);
    await expect(created.json()).resolves.toEqual({ ok: true, requestId: 'cancel-1' });
    const refused = await call(CANCEL_DAYS, body);
    expect(refused.status).toBe(400);
    await expect(refused.json()).resolves.toEqual({ error: 'OUTSIDE_LEAVE' });
  });
});
