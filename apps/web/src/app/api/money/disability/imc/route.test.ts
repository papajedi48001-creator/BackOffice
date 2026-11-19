// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readSession: vi.fn(), getSharedDatabase: vi.fn(), upload: vi.fn(), overview: vi.fn(), cipher: vi.fn() }));
vi.mock('../../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('../../../../../lib/national-id', () => ({ getNationalIdProtector: mocks.cipher }));
vi.mock('@backoffice/core', async (importOriginal) => ({
  ...await importOriginal<typeof import('@backoffice/core')>(),
  ImcService: class { upload = mocks.upload; overview = mocks.overview; }
}));

import { GET, POST } from './route';

const manager = { authenticated: true, personId: 'person-a', roles: [{ name: 'money-manager', organizationId: null }], dataOwnerModules: [] };
const ready = (session: object | null) => { mocks.readSession.mockResolvedValue(session); mocks.getSharedDatabase.mockReturnValue({ query: vi.fn() }); mocks.cipher.mockReturnValue(null); };
const url = 'http://localhost/api/money/disability/imc';
const body = { kind: 'register', fileName: 'ทะเบียน IMC.csv', uploadId: '7c9e6679-7425-40de-944b-e07fc1f90ae7', rows: [['HN']] };
const post = (value: unknown) => new Request(url, { method: 'POST', body: JSON.stringify(value) });

afterEach(() => vi.resetAllMocks());

describe('Monitor IMC route', () => {
  it('answers 401 when signed out', async () => {
    ready(null);
    expect((await GET(new Request(url))).status).toBe(401);
    expect((await POST(post(body))).status).toBe(401);
  });

  it('gives the overview without caching, and 403 when the service refuses', async () => {
    ready(manager);
    mocks.overview.mockResolvedValue({ ok: true, updatedAt: null, persons: [], lines: [], reps: [{ person: null, date: '2026-10-01', repNo: 'R1', paid: 1 }], services: [], totals: {} });
    const answer = await GET(new Request(url));
    expect(answer.status).toBe(200);
    expect(answer.headers.get('cache-control')).toBe('no-store');
    expect(await answer.json()).toEqual({ persons: [], updatedAt: null, lines: [], reps: [{ person: null, date: '2026-10-01', repNo: 'R1', paid: 1 }], services: [], totals: {} });
    mocks.overview.mockResolvedValue({ ok: false, code: 'FORBIDDEN' });
    expect((await GET(new Request(url))).status).toBe(403);
  });

  it('refuses a non-manager upload before reading the body, rejects a bad body and passes a good one on', async () => {
    ready({ ...manager, roles: [] });
    const unread = post(body);
    expect((await POST(unread)).status).toBe(403);
    expect(unread.bodyUsed).toBe(false);
    ready(manager);
    expect((await POST(post({ ...body, kind: 'service' }))).status).toBe(400);
    mocks.upload.mockResolvedValue({ ok: true, kind: 'register', rows: 1, added: 1, updated: 0, skipped: 0 });
    const answer = await POST(post(body));
    expect(answer.status).toBe(200);
    expect(mocks.upload).toHaveBeenCalledWith(expect.objectContaining({ personId: 'person-a' }), body);
    mocks.upload.mockResolvedValue({ ok: false, code: 'INVALID_REPORT', message: 'ไม่ใช่ไฟล์ REP' });
    const refused = await POST(post(body));
    expect(refused.status).toBe(400);
    expect(await refused.json()).toEqual({ error: 'INVALID_REPORT', message: 'ไม่ใช่ไฟล์ REP' });
  });
});
