// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readSession: vi.fn(), getSharedDatabase: vi.fn(), upload: vi.fn(), list: vi.fn(), all: vi.fn(), remove: vi.fn(), removeAll: vi.fn() }));
vi.mock('../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({
  ...await importOriginal<typeof import('@backoffice/core')>(),
  NhsoDatasetService: class { upload = mocks.upload; list = mocks.list; all = mocks.all; remove = mocks.remove; removeAll = mocks.removeAll; }
}));

import { DELETE as REMOVE_ALL, GET, POST } from './datasets/route';
import { DELETE as REMOVE } from './datasets/[hcode]/[fy]/route';

const manager = { authenticated: true, personId: 'person-a', roles: [{ name: 'money-manager', organizationId: null }], dataOwnerModules: [] };
const ready = (session: object | null) => { mocks.readSession.mockResolvedValue(session); mocks.getSharedDatabase.mockReturnValue({ query: vi.fn() }); };
const post = (value: unknown, headers: Record<string, string> = {}) => new Request('http://localhost/api/money/nhso/datasets', { method: 'POST', body: JSON.stringify(value), headers });
const table = [['หน่วยบริการ 11093 โรงพยาบาลวาริชภูมิ']];
const params = (hcode: string, fy: string) => ({ params: Promise.resolve({ hcode, fy }) });

afterEach(() => vi.resetAllMocks());

describe('NHSO dataset routes', () => {
  it('answers 401 when signed out', async () => {
    ready(null);
    expect((await GET(new Request('http://localhost/api/money/nhso/datasets'))).status).toBe(401);
    expect((await POST(post({ fileName: 'a.xlsx', aoa: table }))).status).toBe(401);
  });

  it('answers 400 for a table that breaks the limits, before the service', async () => {
    ready(manager);
    expect((await POST(post({ fileName: 'a.xlsx', aoa: [Array(81).fill('x')] }))).status).toBe(400);
    expect((await POST(post({ fileName: 'a.xlsx', aoa: table }, { 'content-length': String(40 * 1024 * 1024) }))).status).toBe(413);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('refuses a non-manager before reading the body, and caps a chunked body by bytes', async () => {
    ready({ ...manager, roles: [] });
    const unread = post({ fileName: 'a.xlsx', aoa: table });
    expect((await POST(unread)).status).toBe(403);
    expect(unread.bodyUsed).toBe(false);
    ready(manager);
    const chunk = new Uint8Array(1024 * 1024).fill(32);
    let sent = 0;
    const endless = new ReadableStream({ pull(controller) { sent += 1; if (sent > 40) controller.close(); else controller.enqueue(chunk); } });
    const big = await POST(new Request('http://localhost/api/money/nhso/datasets', { method: 'POST', body: endless, duplex: 'half' } as RequestInit));
    expect(big.status).toBe(413);
    expect(sent).toBeLessThan(25);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('returns the import result, the parser message as 400 and 403 for a non-manager', async () => {
    ready(manager);
    mocks.upload
      .mockResolvedValueOnce({ ok: true, hcode: '11093', name: 'โรงพยาบาลวาริชภูมิ', fy: 2569, rows: 678, replaced: true })
      .mockResolvedValueOnce({ ok: false, code: 'INVALID_REPORT', message: 'ไฟล์นี้ไม่มีรายการโอน' })
      .mockResolvedValueOnce({ ok: false, code: 'FORBIDDEN' });
    const done = await POST(post({ fileName: 'a.xlsx', aoa: table }));
    expect(await done.json()).toEqual({ ok: true, hcode: '11093', name: 'โรงพยาบาลวาริชภูมิ', fy: 2569, rows: 678, replaced: true });
    expect(mocks.upload).toHaveBeenCalledWith(manager, { fileName: 'a.xlsx', aoa: table });
    const invalid = await POST(post({ fileName: 'a.xlsx', aoa: table }));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: 'INVALID_REPORT', message: 'ไฟล์นี้ไม่มีรายการโอน' });
    expect((await POST(post({ fileName: 'a.xlsx', aoa: table }))).status).toBe(403);
  });

  it('lists summaries or every dataset with rows, and 403 for someone without the page', async () => {
    ready(manager);
    mocks.list.mockResolvedValueOnce({ ok: true, datasets: [{ hcode: '11093' }] });
    mocks.all.mockResolvedValueOnce({ ok: true, datasets: [{ hcode: '11093', rows: [] }] }).mockResolvedValueOnce({ ok: false, code: 'FORBIDDEN' });
    const listed = await GET(new Request('http://localhost/api/money/nhso/datasets'));
    expect(await listed.json()).toEqual({ datasets: [{ hcode: '11093' }] });
    const full = await GET(new Request('http://localhost/api/money/nhso/datasets?rows=1'));
    expect(await full.json()).toEqual({ datasets: [{ hcode: '11093', rows: [] }] });
    expect(full.headers.get('cache-control')).toBe('no-store');
    expect((await GET(new Request('http://localhost/api/money/nhso/datasets?rows=1'))).status).toBe(403);
  });

  it('removes one dataset, checks the path, and removes all', async () => {
    ready(manager);
    mocks.remove.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false, code: 'NOT_FOUND' });
    mocks.removeAll.mockResolvedValueOnce({ ok: true, removed: 3 });
    const request = new Request('http://localhost/api/money/nhso/datasets/11093/2569', { method: 'DELETE' });
    expect((await REMOVE(request, params('11093', '2569'))).status).toBe(200);
    expect(mocks.remove).toHaveBeenCalledWith(manager, '11093', 2569);
    expect((await REMOVE(request, params('11093', '2569'))).status).toBe(404);
    expect((await REMOVE(request, params('1109x', '2569'))).status).toBe(404);
    expect((await REMOVE(request, params('11093', '25x9'))).status).toBe(404);
    expect(mocks.remove).toHaveBeenCalledTimes(2);
    expect(await (await REMOVE_ALL(new Request('http://localhost/api/money/nhso/datasets', { method: 'DELETE' }))).json()).toEqual({ ok: true, removed: 3 });
  });
});
