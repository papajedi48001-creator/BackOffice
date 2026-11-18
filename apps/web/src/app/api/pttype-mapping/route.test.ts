// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readSession: vi.fn(), getSharedDatabase: vi.fn(), save: vi.fn(), load: vi.fn(), recordExport: vi.fn() }));
vi.mock('../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('../../../lib/hosxp', () => ({ pttypeMappingService: () => ({ save: mocks.save, load: mocks.load, recordExport: mocks.recordExport }) }));

import { PUT } from './[pttype]/route';
import { GET as EXPORT } from './export/route';

const staff = { authenticated: true, personId: 'person-a', roles: [], dataOwnerModules: [], hospitalWideDataOwnerModules: [] };
const manager = { ...staff, roles: [{ name: 'pttype-mapping-manager', organizationId: null }] };
const body = { opd: 'P1', ipd: null, expected: { opd: null, ipd: null } };
const put = (pttype: string, value: unknown) => PUT(new Request(`http://localhost/api/pttype-mapping/${pttype}`, { method: 'PUT', body: JSON.stringify(value) }), { params: Promise.resolve({ pttype }) });
const ready = (session: object | null) => { mocks.readSession.mockResolvedValue(session); mocks.getSharedDatabase.mockReturnValue({ query: vi.fn() }); };
const right = (code: string) => ({ code, name: `สิทธิ ${code}`, opd: null, ipd: null });

afterEach(() => vi.resetAllMocks());

describe('PUT /api/pttype-mapping/[pttype]', () => {
  it('answers 401 signed out and 400 for a bad code or body without calling the service', async () => {
    ready(null);
    expect((await put('34', body)).status).toBe(401);
    ready(manager);
    expect((await put('3 4', body)).status).toBe(400);
    expect((await put('34', { ...body, opd: 'x y' })).status).toBe(400);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('passes the session, code and input to the service and maps its result', async () => {
    ready(manager);
    const codes = [['ok', 200], ['FORBIDDEN', 403], ['NOT_FOUND', 404], ['STALE', 409], ['INVALID_ACCOUNT', 422], ['NO_CHANGE', 422], ['NO_WRITE_PERMISSION', 503], ['HOSXP_FAILED', 503], ['NOT_CONFIGURED', 503], ['NOT_TRANSACTIONAL', 503]] as const;
    for (const [code, status] of codes) {
      mocks.save.mockResolvedValueOnce(code === 'ok' ? { ok: true } : { ok: false, code });
      const response = await put('34', body);
      expect(response.status).toBe(status);
      if (code !== 'ok') expect(await response.json()).toEqual({ error: code });
    }
    expect(mocks.save).toHaveBeenCalledWith(manager, '34', body);
  });
});

describe('GET /api/pttype-mapping/export', () => {
  const get = (query: string) => EXPORT(new Request(`http://localhost/api/pttype-mapping/export${query}`));

  it('refuses someone who does not manage the module', async () => {
    ready(staff);
    expect((await get('?pttype=34')).status).toBe(403);
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it('sends the สิทธิ asked for in order, audited with the row count', async () => {
    ready(manager);
    mocks.load.mockResolvedValue({ ok: true, snapshot: { rights: [right('10'), right('34'), right('89')], opdAccounts: [], ipdAccounts: [] }, editors: {} });
    const response = await get('?pttype=89,10');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    const lines = (await response.text()).split('\r\n');
    expect(lines.slice(1, 3).map((line) => line.split(',')[0])).toEqual(['10', '89']);
    expect(mocks.recordExport).toHaveBeenCalledWith('person-a', 2);
  });

  it('answers 503 when HOSxP cannot be read', async () => {
    ready(manager);
    mocks.load.mockResolvedValue({ ok: false, code: 'HOSXP_FAILED' });
    expect((await get('?pttype=34')).status).toBe(503);
  });
});
