// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readSession: vi.fn(), getSharedDatabase: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() }));
vi.mock('../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), OrganizationStructureService: class { create = mocks.create; update = mocks.update; delete = mocks.remove; } }));

import { POST } from './route';
import { DELETE, PUT } from './[organizationId]/route';

const hrManager = { authenticated: true, personId: 'person-a', roles: [{ name: 'hr-manager', organizationId: null }], dataOwnerModules: ['hr'], hospitalWideDataOwnerModules: ['hr'] };
const hrReader = { ...hrManager, roles: [{ name: 'hr-reader', organizationId: null }] };
const json = (method: string, body?: unknown) => new Request('http://localhost/api/hr/organizations', { method, body: body === undefined ? undefined : JSON.stringify(body) });
const params = { params: Promise.resolve({ organizationId: 'org-1' }) };
const ready = () => { mocks.readSession.mockResolvedValue(hrManager); mocks.getSharedDatabase.mockReturnValue({}); };

afterEach(() => vi.clearAllMocks());

describe('organization structure routes', () => {
  it('refuses anyone but a hospital-wide HR manager', async () => {
    mocks.readSession.mockResolvedValueOnce(null);
    expect((await POST(json('POST', { name: 'x', unitType: 'DIVISION' }))).status).toBe(401);
    mocks.readSession.mockResolvedValue(hrReader);
    expect((await POST(json('POST', { name: 'x', unitType: 'DIVISION' }))).status).toBe(403);
    expect((await PUT(json('PUT', { name: 'x' }), params)).status).toBe(403);
    expect((await DELETE(json('DELETE'), params)).status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('adds a unit as the signed-in manager and answers its id', async () => {
    ready();
    mocks.create.mockResolvedValue({ ok: true, id: 'org-9' });
    const response = await POST(json('POST', { name: 'งานผู้ป่วยใน', unitType: 'SECTION', parentId: 'div-1' }));
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ ok: true, id: 'org-9' });
    expect(mocks.create).toHaveBeenCalledWith({ name: 'งานผู้ป่วยใน', unitType: 'SECTION', parentId: 'div-1' }, 'person-a');
    expect((await POST(json('POST', { name: '', unitType: 'SECTION' }))).status).toBe(400);
  });

  it('renames, moves and deletes, naming each refusal', async () => {
    ready();
    mocks.update.mockResolvedValueOnce({ ok: true });
    expect((await PUT(json('PUT', { name: 'งานใหม่', parentId: 'div-2' }), params)).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith('org-1', { name: 'งานใหม่', parentId: 'div-2' }, 'person-a');
    for (const [code, status] of [['DUPLICATE_NAME', 409], ['PARENT_NOT_DIVISION', 400], ['ORGANIZATION_NOT_FOUND', 404]] as const) {
      mocks.update.mockResolvedValueOnce({ ok: false, code });
      const response = await PUT(json('PUT', { name: 'x' }), params);
      expect(response.status).toBe(status);
      await expect(response.json()).resolves.toEqual({ error: code });
    }
    mocks.remove.mockResolvedValueOnce({ ok: true, units: 2, people: 5 });
    const deleted = await DELETE(json('DELETE'), params);
    await expect(deleted.json()).resolves.toEqual({ ok: true, units: 2, people: 5 });
    expect(mocks.remove).toHaveBeenCalledWith('org-1', 'person-a');
    mocks.remove.mockResolvedValueOnce({ ok: false, code: 'ORGANIZATION_NOT_FOUND' });
    expect((await DELETE(json('DELETE'), params)).status).toBe(404);
  });
});
