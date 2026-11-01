// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readSession: vi.fn(), getSharedDatabase: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), importCsv: vi.fn() }));
vi.mock('../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), PositionCatalogService: class { create = mocks.create; update = mocks.update; delete = mocks.remove; importCsv = mocks.importCsv; } }));

import { POST } from './route';
import { DELETE, PUT } from './[positionId]/route';
import { POST as IMPORT } from './import/route';

const manager = { authenticated: true, personId: 'person-a', roles: [{ name: 'hr-manager', organizationId: null }], dataOwnerModules: ['hr'], hospitalWideDataOwnerModules: ['hr'] };
const reader = { ...manager, roles: [{ name: 'hr-reader', organizationId: null }] };
const body = { name: 'เจ้าพนักงานธุรการ', category: 'GENERAL', allowedLevels: ['ปฏิบัติงาน', 'ชำนาญงาน', 'อาวุโส'], isActive: true, sortOrder: 10 };
const request = (method: string, value: unknown) => new Request('http://localhost/api/hr/positions', { method, body: JSON.stringify(value) });
const params = { params: Promise.resolve({ positionId: 'pos-1' }) };

afterEach(() => vi.clearAllMocks());

describe('position routes', () => {
  it('answer 401 without a session and 403 for anyone but a hospital-wide hr manager', async () => {
    mocks.getSharedDatabase.mockReturnValue({});
    mocks.readSession.mockResolvedValue(null);
    expect((await POST(request('POST', body))).status).toBe(401);
    mocks.readSession.mockResolvedValue(reader);
    expect((await POST(request('POST', body))).status).toBe(403);
    expect((await PUT(request('PUT', body), params)).status).toBe(403);
    expect((await DELETE(request('DELETE', {}), params)).status).toBe(403);
    expect((await IMPORT(request('POST', { csv: 'name,category,levels,active\n' }))).status).toBe(403);
    expect([mocks.create, mocks.update, mocks.remove, mocks.importCsv].every((mock) => mock.mock.calls.length === 0)).toBe(true);
  });

  it('adds, edits and deletes a position, mapping each refusal to its status', async () => {
    mocks.readSession.mockResolvedValue(manager);
    mocks.getSharedDatabase.mockReturnValue({});
    mocks.create.mockResolvedValueOnce({ ok: true, id: 'pos-1' }).mockResolvedValueOnce({ ok: false, code: 'DUPLICATE_NAME' });
    expect((await POST(request('POST', body))).status).toBe(200);
    expect(mocks.create).toHaveBeenCalledWith(body, 'person-a');
    expect((await POST(request('POST', body))).status).toBe(409);
    expect((await POST(request('POST', { ...body, allowedLevels: ['ปฏิบัติการ'] }))).status).toBe(400);
    mocks.update.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false, code: 'NOT_FOUND' });
    expect((await PUT(request('PUT', body), params)).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith('pos-1', body, 'person-a');
    expect((await PUT(request('PUT', body), params)).status).toBe(404);
    mocks.remove.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false, code: 'POSITION_IN_USE' });
    expect((await DELETE(request('DELETE', {}), params)).status).toBe(200);
    expect(mocks.remove).toHaveBeenCalledWith('pos-1', 'person-a');
    expect((await DELETE(request('DELETE', {}), params)).status).toBe(409);
  });

  it('imports a CSV and answers 422 with the line errors', async () => {
    mocks.readSession.mockResolvedValue(manager);
    mocks.getSharedDatabase.mockReturnValue({});
    mocks.importCsv.mockResolvedValueOnce({ ok: true, created: 1, updated: 2 }).mockResolvedValueOnce({ ok: false, errors: [{ line: 2, code: 'UNKNOWN_CATEGORY' }] });
    const done = await IMPORT(request('POST', { csv: 'name,category,levels,active\nก,GENERAL,ปฏิบัติงาน,1\n' }));
    expect(done.status).toBe(200);
    await expect(done.json()).resolves.toEqual({ ok: true, created: 1, updated: 2 });
    expect(mocks.importCsv).toHaveBeenCalledWith('name,category,levels,active\nก,GENERAL,ปฏิบัติงาน,1\n', 'person-a');
    const refused = await IMPORT(request('POST', { csv: 'x' }));
    expect(refused.status).toBe(422);
    await expect(refused.json()).resolves.toEqual({ errors: [{ line: 2, code: 'UNKNOWN_CATEGORY' }] });
    expect((await IMPORT(request('POST', { csv: 'a'.repeat(600 * 1024) }))).status).toBe(400);
  });
});
