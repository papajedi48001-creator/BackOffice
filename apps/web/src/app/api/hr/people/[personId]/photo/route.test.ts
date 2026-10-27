// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readSession: vi.fn(), getSharedDatabase: vi.fn(), enabled: vi.fn(), open: vi.fn(), photoAttachmentOf: vi.fn() }));
vi.mock('../../../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('../../../../../../lib/attachments', async (importOriginal) => ({ ...await importOriginal<typeof import('../../../../../../lib/attachments')>(), attachmentsEnabled: mocks.enabled, attachmentService: () => ({ openAttachment: mocks.open }) }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), HrProfileService: class { photoAttachmentOf = mocks.photoAttachmentOf; } }));

import { GET } from './route';

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
