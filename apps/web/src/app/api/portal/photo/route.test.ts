// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OidcError } from '@backoffice/core';

const mocks = vi.hoisted(() => ({ config: vi.fn(), getSharedDatabase: vi.fn(), enabled: vi.fn(), open: vi.fn(), verify: vi.fn(), findLink: vi.fn(), isActivePerson: vi.fn(), photoAttachmentOf: vi.fn() }));
vi.mock('../../../../lib/provider-sso', () => ({ providerSsoConfig: mocks.config, portalOidcClient: () => ({ verifyPortalRequest: mocks.verify }) }));
vi.mock('../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('../../../../lib/attachments', () => ({ attachmentsEnabled: mocks.enabled, attachmentService: () => ({ openAttachment: mocks.open }) }));
vi.mock('@backoffice/core', async (importOriginal) => ({
  ...await importOriginal<typeof import('@backoffice/core')>(),
  HrProfileService: class { photoAttachmentOf = mocks.photoAttachmentOf; },
  DatabaseExternalIdentityRepository: class { findLink = mocks.findLink; isActivePerson = mocks.isActivePerson; }
}));

import { GET } from './route';

const config = { issuer: 'https://portal.test', clientId: 'backoffice', clientSecret: 's', redirectUri: 'https://office.test/api/auth/provider/callback' };
const get = (authorization: string | null = 'Bearer signed.request.token') => GET(new Request('http://localhost/api/portal/photo', { headers: authorization ? { authorization } : {} }));
const ready = () => {
  mocks.config.mockReturnValue(config); mocks.getSharedDatabase.mockReturnValue({}); mocks.enabled.mockReturnValue(true);
  mocks.verify.mockResolvedValue('member-1'); mocks.findLink.mockResolvedValue({ personId: 'person-1' }); mocks.isActivePerson.mockResolvedValue(true);
};

afterEach(() => vi.clearAllMocks());

describe('GET /api/portal/photo', () => {
  it('does not exist while Provider ID sign-in is not set up', async () => {
    mocks.config.mockReturnValue(null);
    expect((await get()).status).toBe(404);
  });

  it('refuses a request without a valid portal-signed token', async () => {
    ready();
    expect((await get(null)).status).toBe(401);
    mocks.verify.mockRejectedValue(new OidcError('INVALID'));
    expect((await get()).status).toBe(401);
    expect(mocks.verify).toHaveBeenCalledWith('signed.request.token', 'backoffice-photo-request+jwt');
    expect(mocks.findLink).not.toHaveBeenCalled();
  });

  it('answers 503 when the portal keys cannot be fetched', async () => {
    ready();
    mocks.verify.mockRejectedValue(new OidcError('UNAVAILABLE'));
    expect((await get()).status).toBe(503);
  });

  it('answers 404 for an unlinked member, an inactive person or a person without a photo', async () => {
    ready();
    mocks.findLink.mockResolvedValueOnce(null);
    expect((await get()).status).toBe(404);
    mocks.isActivePerson.mockResolvedValueOnce(false);
    expect((await get()).status).toBe(404);
    mocks.photoAttachmentOf.mockResolvedValueOnce(null);
    expect((await get()).status).toBe(404);
    expect(mocks.findLink).toHaveBeenCalledWith('https://portal.test', 'member-1');
    expect(mocks.open).not.toHaveBeenCalled();
  });

  it('returns the linked person\'s current photo, opening only that file and not caching it', async () => {
    ready();
    mocks.photoAttachmentOf.mockResolvedValue('att-1');
    mocks.open.mockImplementation(async (input: { attachmentId: string }, authorizer: { canDownload: (input: unknown, attachment: unknown) => Promise<boolean> }) => {
      const attachment = { id: input.attachmentId, contentType: 'image/jpeg' };
      expect(await authorizer.canDownload(input, attachment)).toBe(true);
      expect(await authorizer.canDownload(input, { ...attachment, id: 'att-other' })).toBe(false);
      return { attachment, bytes: new Uint8Array([1, 2, 3]) };
    });
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(mocks.photoAttachmentOf).toHaveBeenCalledWith('person-1');
    expect(mocks.open).toHaveBeenCalledWith({ attachmentId: 'att-1', actorPersonId: 'person-1' }, expect.anything(), { recordDownload: false });
  });
});
