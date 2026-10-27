// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readSession: vi.fn(), getSharedDatabase: vi.fn(), enabled: vi.fn(), upload: vi.fn(), setOwnPhoto: vi.fn() }));
vi.mock('../../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('../../../../../lib/attachments', async (importOriginal) => ({ ...await importOriginal<typeof import('../../../../../lib/attachments')>(), attachmentsEnabled: mocks.enabled, attachmentService: () => ({ uploadAttachment: mocks.upload }) }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), HrProfileService: class { setOwnPhoto = mocks.setOwnPhoto; } }));

import { DELETE, POST } from './route';

const staff = { authenticated: true, personId: 'person-self', roles: [], dataOwnerModules: [] };
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
function form(file: File | null) { const body = new FormData(); if (file) body.append('file', file); return new Request('http://localhost/api/hr/me/photo', { method: 'POST', body }); }
const ready = () => { mocks.readSession.mockResolvedValue(staff); mocks.getSharedDatabase.mockReturnValue({}); mocks.enabled.mockReturnValue(true); };

afterEach(() => vi.clearAllMocks());

describe('POST /api/hr/me/photo', () => {
  it('rejects a signed-out user', async () => {
    mocks.readSession.mockResolvedValue(null);
    expect((await POST(form(new File([png], 'me.png', { type: 'image/png' })))).status).toBe(401);
  });

  it('answers 503 while storage is not configured', async () => {
    ready();
    mocks.enabled.mockReturnValue(false);
    const response = await POST(form(new File([png], 'me.png', { type: 'image/png' })));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'object_storage_not_configured' });
  });

  it('refuses a PDF and a photo over 2 MB', async () => {
    ready();
    expect((await POST(form(new File([new TextEncoder().encode('%PDF-1.7')], 'a.pdf', { type: 'application/pdf' })))).status).toBe(415);
    expect((await POST(form(new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' })))).status).toBe(413);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('stores the photo for the session person and sets it on their profile', async () => {
    ready();
    mocks.upload.mockResolvedValue({ id: 'att-1', objectKey: 'attachments/x', contentType: 'image/png', sizeBytes: png.byteLength, createdByPersonId: 'person-self', filename: 'me.png' });
    mocks.setOwnPhoto.mockResolvedValue({ ok: true });
    const response = await POST(form(new File([png], 'me.png', { type: 'image/png' })));
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ photoUrl: '/api/hr/people/person-self/photo?v=att-1' });
    expect(mocks.upload).toHaveBeenCalledWith({ actorPersonId: 'person-self', filename: 'me.png', contentType: 'image/png', bytes: png });
    expect(mocks.setOwnPhoto).toHaveBeenCalledWith('person-self', 'att-1', staff);
  });

  it('maps an upload failure to its status without saying more', async () => {
    ready();
    mocks.upload.mockRejectedValue(new Error('INVALID_FILE_CONTENT'));
    const response = await POST(form(new File([png], 'me.png', { type: 'image/png' })));
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({ error: 'INVALID_FILE_CONTENT' });
  });
});

describe('DELETE /api/hr/me/photo', () => {
  it('removes the session person\'s photo', async () => {
    ready();
    mocks.setOwnPhoto.mockResolvedValue({ ok: true });
    expect((await DELETE(new Request('http://localhost/api/hr/me/photo', { method: 'DELETE' }))).status).toBe(200);
    expect(mocks.setOwnPhoto).toHaveBeenCalledWith('person-self', null, staff);
  });
});
