// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readSession: vi.fn(), getSharedDatabase: vi.fn(), upload: vi.fn() }));
vi.mock('../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('../../../../lib/hosxp', () => ({ ofcService: () => ({ upload: mocks.upload }) }));

import { POST } from './route';

const manager = { authenticated: true, personId: 'person-a', roles: [{ name: 'money-manager', organizationId: null }], dataOwnerModules: [] };
const ready = (session: object | null) => { mocks.readSession.mockResolvedValue(session); mocks.getSharedDatabase.mockReturnValue({ query: vi.fn() }); };
const url = 'http://localhost/api/money/ofc';
const body = { fileName: 'STM_11093_OP202609_02.xls', sheets: { 'พึงรับ': [['เลขที่เอกสาร 11093_OP202609_02']] } };
const post = (value: unknown) => new Request(url, { method: 'POST', body: JSON.stringify(value) });

afterEach(() => vi.resetAllMocks());

describe('Monitor Instrument OFC upload route', () => {
  it('answers 401 when signed out', async () => {
    ready(null);
    expect((await POST(post(body))).status).toBe(401);
  });

  it('refuses a non-manager before reading the body, rejects a bad body and passes a good one on', async () => {
    ready({ ...manager, roles: [] });
    const unread = post(body);
    expect((await POST(unread)).status).toBe(403);
    expect(unread.bodyUsed).toBe(false);
    ready(manager);
    expect((await POST(post({ ...body, kind: 'rep' }))).status).toBe(400);
    mocks.upload.mockResolvedValue({ ok: true, kind: 'stm', rows: 1, added: 1, updated: 0, skipped: 0 });
    const answer = await POST(post(body));
    expect(answer.status).toBe(200);
    expect(mocks.upload).toHaveBeenCalledWith(expect.objectContaining({ personId: 'person-a' }), body);
    mocks.upload.mockResolvedValue({ ok: false, code: 'INVALID_REPORT', message: 'ไม่ใช่ไฟล์ของ OFC' });
    const refused = await POST(post(body));
    expect(refused.status).toBe(400);
    expect(await refused.json()).toEqual({ error: 'INVALID_REPORT', message: 'ไม่ใช่ไฟล์ของ OFC' });
  });
});
