// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readSession: vi.fn(), getSharedDatabase: vi.fn(), save: vi.fn(), remove: vi.fn() }));
vi.mock('../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), SiteImageService: class { save = mocks.save; remove = mocks.remove; } }));

import { DELETE, POST } from './route';

const admin = { authenticated: true, personId: 'person-admin', roles: [{ name: 'admin', organizationId: null }], dataOwnerModules: [] };
const staff = { authenticated: true, personId: 'person-s', roles: [], dataOwnerModules: [] };
const ready = (session: object = admin) => { mocks.readSession.mockResolvedValue(session); mocks.getSharedDatabase.mockReturnValue({}); };
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2]);
function upload(file: Blob | string | null) {
  const form = new FormData();
  if (file !== null) form.set('file', file);
  return new Request('http://localhost/api/admin/site-image', { method: 'POST', body: form });
}

afterEach(() => { vi.resetAllMocks(); });

describe('site image API', () => {
  it('refuses anyone who is not ผู้ดูแลระบบ before reading the upload', async () => {
    ready(staff);
    expect((await POST(upload(new Blob([jpeg])))).status).toBe(403);
    expect((await DELETE(new Request('http://localhost/api/admin/site-image', { method: 'DELETE' }))).status).toBe(403);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('stores the uploaded login photo for the admin', async () => {
    ready();
    mocks.save.mockResolvedValue({ ok: true, version: 'abcdef0123456789' });
    const response = await POST(upload(new File([jpeg], 'hospital.jpg', { type: 'image/jpeg' })));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, version: 'abcdef0123456789' });
    const [slot, bytes, actor] = mocks.save.mock.calls[0];
    expect([slot, Array.from(bytes as Uint8Array), actor]).toEqual(['login-hero', Array.from(jpeg), 'person-admin']);
  });

  it('answers 400 without a file, and passes on the service refusals', async () => {
    ready();
    expect((await POST(upload(null))).status).toBe(400);
    expect((await POST(upload('not a file'))).status).toBe(400);
    mocks.save.mockResolvedValue({ ok: false, code: 'INVALID_IMAGE' });
    expect((await POST(upload(new Blob([jpeg])))).status).toBe(400);
    mocks.save.mockResolvedValue({ ok: false, code: 'TOO_LARGE' });
    expect((await POST(upload(new Blob([jpeg])))).status).toBe(413);
  });

  it('removes the photo for the admin', async () => {
    ready();
    mocks.remove.mockResolvedValue({ ok: true });
    expect((await DELETE(new Request('http://localhost/api/admin/site-image', { method: 'DELETE' }))).status).toBe(200);
    expect(mocks.remove).toHaveBeenCalledWith('login-hero', 'person-admin');
  });
});
