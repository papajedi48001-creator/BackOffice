// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readSession: vi.fn(), getSharedDatabase: vi.fn(), enabled: vi.fn(), open: vi.fn(), photoAttachmentOf: vi.fn(), upload: vi.fn(), setPersonPhoto: vi.fn() }));
vi.mock('../../../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('../../../../../../lib/attachments', async (importOriginal) => ({ ...await importOriginal<typeof import('../../../../../../lib/attachments')>(), attachmentsEnabled: mocks.enabled, attachmentService: () => ({ openAttachment: mocks.open, uploadAttachment: mocks.upload }) }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), HrProfileService: class { photoAttachmentOf = mocks.photoAttachmentOf; setPersonPhoto = mocks.setPersonPhoto; } }));

import { DELETE, GET, POST } from './route';

const staff = { authenticated: true, personId: 'viewer', roles: [], dataOwnerModules: [] };
const get = (personId = 'colleague') => GET(new Request(`http://localhost/api/hr/people/${personId}/photo`), { params: Promise.resolve({ personId }) });
const ready = () => { mocks.readSession.mockResolvedValue(staff); mocks.getSharedDatabase.mockReturnValue({}); mocks.enabled.mockReturnValue(true); };

afterEach(() => vi.clearAllMocks());

describe('GET /api/hr/people/[personId]/photo', () => {
  it('rejects a signed-out user', async () => {
    mocks.readSession.mockResolvedValue(null);
    expect((await get()).status).toBe(401);
  });

  it('answers 404 for a person without a photo', async () => {
    ready();
    mocks.photoAttachmentOf.mockResolvedValue(null);
    expect((await get()).status).toBe(404);
    expect(mocks.open).not.toHaveBeenCalled();
  });

  it('shows a colleague\'s photo inline to any signed-in person without auditing each view', async () => {
    ready();
    mocks.photoAttachmentOf.mockResolvedValue('att-1');
    mocks.open.mockImplementation(async (input: { attachmentId: string }, authorizer: { canDownload: (input: unknown, attachment: unknown) => Promise<boolean> }) => {
      const attachment = { id: input.attachmentId, contentType: 'image/webp', filename: 'me.webp' };
      expect(await authorizer.canDownload(input, attachment)).toBe(true);
      expect(await authorizer.canDownload(input, { ...attachment, id: 'att-other' })).toBe(false);
      return { attachment, bytes: new Uint8Array([1, 2, 3]) };
    });
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/webp');
    expect(response.headers.get('content-disposition')).toBe('inline');
    expect(response.headers.get('cache-control')).toBe('private, max-age=300');
    expect(mocks.open).toHaveBeenCalledWith({ attachmentId: 'att-1', actorPersonId: 'viewer' }, expect.anything(), { recordDownload: false });
  });
});

describe('POST and DELETE /api/hr/people/[personId]/photo', () => {
  const hr = { authenticated: true, personId: 'hr-1', roles: [{ name: 'hr-manager', organizationId: null }], dataOwnerModules: ['hr'], hospitalWideDataOwnerModules: ['hr'] };
  const params = { params: Promise.resolve({ personId: 'colleague' }) };
  const upload = (file: File) => { const body = new FormData(); body.append('file', file); return POST(new Request('http://localhost/api/hr/people/colleague/photo', { method: 'POST', body }), params); };
  const png = () => new File([new Uint8Array([1, 2, 3])], 'face.png', { type: 'image/png' });
  const readyHr = () => { mocks.readSession.mockResolvedValue(hr); mocks.getSharedDatabase.mockReturnValue({}); mocks.enabled.mockReturnValue(true); };

  it('rejects a signed-out user and answers 503 without object storage', async () => {
    mocks.readSession.mockResolvedValue(null);
    expect((await upload(png())).status).toBe(401);
    readyHr();
    mocks.enabled.mockReturnValue(false);
    expect((await upload(png())).status).toBe(503);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('refuses a file that is not a JPEG, PNG or WebP', async () => {
    readyHr();
    expect((await upload(new File(['x'], 'a.pdf', { type: 'application/pdf' }))).status).toBe(415);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('uploads as the HR person and sets the photo of the person in the URL', async () => {
    readyHr();
    mocks.upload.mockResolvedValue({ id: 'att-9' });
    mocks.setPersonPhoto.mockResolvedValue({ ok: true });
    const response = await upload(png());
    expect(response.status).toBe(201);
    expect(mocks.upload).toHaveBeenCalledWith(expect.objectContaining({ actorPersonId: 'hr-1', contentType: 'image/png' }));
    expect(mocks.setPersonPhoto).toHaveBeenCalledWith('colleague', 'att-9', hr);
    await expect(response.json()).resolves.toEqual({ photoUrl: '/api/hr/people/colleague/photo?v=att-9' });
  });

  it('maps a refusal and removes the photo on DELETE', async () => {
    readyHr();
    mocks.upload.mockResolvedValue({ id: 'att-9' });
    mocks.setPersonPhoto.mockResolvedValueOnce({ ok: false, code: 'FORBIDDEN' });
    expect((await upload(png())).status).toBe(403);
    mocks.setPersonPhoto.mockResolvedValueOnce({ ok: true });
    expect((await DELETE(new Request('http://localhost/api/hr/people/colleague/photo', { method: 'DELETE' }), params)).status).toBe(200);
    expect(mocks.setPersonPhoto).toHaveBeenLastCalledWith('colleague', null, hr);
  });
});
