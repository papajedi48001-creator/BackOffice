// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getSharedDatabase: vi.fn(), read: vi.fn() }));
vi.mock('../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), SiteImageService: class { read = mocks.read; } }));

import { GET } from './route';

const photo = { contentType: 'image/jpeg', data: Buffer.from([0xff, 0xd8, 0xff, 1]), version: 'abcdef0123456789' };
afterEach(() => { vi.resetAllMocks(); });

describe('GET /api/site/login-photo', () => {
  it('serves the photo to anyone (the sign-in page needs it before sign-in), never sniffed as another type', async () => {
    mocks.getSharedDatabase.mockReturnValue({});
    mocks.read.mockResolvedValue(photo);
    const response = await GET(new Request('http://localhost/api/site/login-photo?v=abcdef0123456789'));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('cache-control')).toContain('immutable');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(photo.data);
    expect(mocks.read).toHaveBeenCalledWith('login-hero');
  });

  it('is not cached for long when the URL names an old or no version', async () => {
    mocks.getSharedDatabase.mockReturnValue({});
    mocks.read.mockResolvedValue(photo);
    const response = await GET(new Request('http://localhost/api/site/login-photo?v=old'));
    expect(response.headers.get('cache-control')).not.toContain('immutable');
  });

  it('is 404 when no photo is set or there is no database', async () => {
    mocks.getSharedDatabase.mockReturnValue({});
    mocks.read.mockResolvedValue(null);
    expect((await GET(new Request('http://localhost/api/site/login-photo'))).status).toBe(404);
    mocks.getSharedDatabase.mockReturnValue(null);
    expect((await GET(new Request('http://localhost/api/site/login-photo'))).status).toBe(404);
  });
});
