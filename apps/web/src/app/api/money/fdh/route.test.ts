// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readSession: vi.fn(), getSharedDatabase: vi.fn(), upload: vi.fn(), list: vi.fn(), all: vi.fn(), remove: vi.fn(), removeAll: vi.fn(), cipher: vi.fn() }));
vi.mock('../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('../../../../lib/national-id', () => ({ getNationalIdProtector: mocks.cipher }));
vi.mock('@backoffice/core', async (importOriginal) => ({
  ...await importOriginal<typeof import('@backoffice/core')>(),
  FdhDocumentService: class { upload = mocks.upload; list = mocks.list; all = mocks.all; remove = mocks.remove; removeAll = mocks.removeAll; }
}));

import { DELETE, GET, POST } from './documents/route';

const manager = { authenticated: true, personId: 'person-a', roles: [{ name: 'money-manager', organizationId: null }], dataOwnerModules: [] };
const ready = (session: object | null) => { mocks.readSession.mockResolvedValue(session); mocks.getSharedDatabase.mockReturnValue({ query: vi.fn() }); mocks.cipher.mockReturnValue(null); };
const url = 'http://localhost/api/money/fdh/documents';
const post = (value: unknown) => new Request(url, { method: 'POST', body: JSON.stringify(value) });
const sheets = { Detail: [['REP No.']] };
const remove = (value: unknown) => new Request(url, { method: 'DELETE', body: JSON.stringify(value) });

afterEach(() => vi.resetAllMocks());

describe('FDH document routes', () => {
  it('answers 401 when signed out', async () => {
    ready(null);
    expect((await GET(new Request(url))).status).toBe(401);
    expect((await POST(post({ fileName: 'a.xls', sheets }))).status).toBe(401);
  });

  it('refuses a non-manager before reading the body, and caps the body by bytes', async () => {
    ready({ ...manager, roles: [] });
    const unread = post({ fileName: 'a.xls', sheets });
    expect((await POST(unread)).status).toBe(403);
    expect(unread.bodyUsed).toBe(false);
    ready(manager);
    const chunk = new Uint8Array(1024 * 1024).fill(32);
    let sent = 0;
    const endless = new ReadableStream({ pull(controller) { sent += 1; if (sent > 60) controller.close(); else controller.enqueue(chunk); } });
    expect((await POST(new Request(url, { method: 'POST', body: endless, duplex: 'half' } as RequestInit))).status).toBe(413);
    expect(sent).toBeLessThan(35);
    expect((await POST(post({ fileName: 'a.xls', sheets: { Detail: [Array(201).fill('x')] } }))).status).toBe(400);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('returns the import result, the parser message as 400 and the missing key as 503', async () => {
    ready(manager);
    mocks.upload
      .mockResolvedValueOnce({ ok: true, kind: 'rep', docNo: 'eclaim_1', period: '', items: 56, replaced: true })
      .mockResolvedValueOnce({ ok: false, code: 'INVALID_REPORT', message: 'ไฟล์นี้ไม่ใช่ REP หรือ STM ของ FDH' })
      .mockResolvedValueOnce({ ok: false, code: 'NOT_CONFIGURED', message: 'ยังไม่ได้ตั้งค่ากุญแจ' });
    expect(await (await POST(post({ fileName: 'a.xls', sheets }))).json()).toEqual({ ok: true, kind: 'rep', docNo: 'eclaim_1', period: '', items: 56, replaced: true });
    expect(mocks.upload).toHaveBeenCalledWith(manager, { fileName: 'a.xls', sheets });
    const invalid = await POST(post({ fileName: 'a.xls', sheets }));
    expect([invalid.status, await invalid.json()]).toEqual([400, { error: 'INVALID_REPORT', message: 'ไฟล์นี้ไม่ใช่ REP หรือ STM ของ FDH' }]);
    const missing = await POST(post({ fileName: 'a.xls', sheets }));
    expect([missing.status, await missing.json()]).toEqual([503, { error: 'NOT_CONFIGURED', message: 'ยังไม่ได้ตั้งค่ากุญแจ' }]);
  });

  it('lists summaries or every document, uncached, and 403 for someone without the page', async () => {
    ready(manager);
    mocks.list.mockResolvedValueOnce({ ok: true, reps: [{ docNo: 'a' }], stms: [] });
    mocks.all.mockResolvedValueOnce({ ok: true, reps: [], stms: [{ doc_no: 'b' }] }).mockResolvedValueOnce({ ok: false, code: 'FORBIDDEN' });
    expect(await (await GET(new Request(url))).json()).toEqual({ reps: [{ docNo: 'a' }], stms: [] });
    const full = await GET(new Request(`${url}?full=1`));
    expect(await full.json()).toEqual({ reps: [], stms: [{ doc_no: 'b' }] });
    expect(full.headers.get('cache-control')).toBe('no-store');
    expect((await GET(new Request(`${url}?full=1`))).status).toBe(403);
  });

  it('removes one document or every document of one kind, with เลขที่เอกสาร in the body and never in the URL', async () => {
    ready(manager);
    mocks.remove.mockResolvedValueOnce({ ok: true });
    mocks.removeAll.mockResolvedValueOnce({ ok: true, removed: 3 });
    expect((await DELETE(remove({ kind: 'rep', docNo: 'eclaim_1' }))).status).toBe(200);
    expect(mocks.remove).toHaveBeenCalledWith(manager, 'rep', 'eclaim_1');
    expect((await DELETE(remove({ kind: 'xls', docNo: 'eclaim_1' }))).status).toBe(400);
    expect((await DELETE(remove({ kind: 'rep', docNo: '../x' }))).status).toBe(400);
    expect((await DELETE(new Request(url, { method: 'DELETE', body: 'not json' }))).status).toBe(400);
    expect(await (await DELETE(remove({ kind: 'stm' }))).json()).toEqual({ ok: true, removed: 3 });
    expect(mocks.removeAll).toHaveBeenCalledWith(manager, 'stm');
    expect((await DELETE(remove({ kind: 'all' }))).status).toBe(400);
  });

  it('refuses a delete from a non-manager without reading the body', async () => {
    ready({ ...manager, roles: [] });
    const request = remove({ kind: 'rep', docNo: 'eclaim_1' });
    const json = vi.spyOn(request, 'json');
    const text = vi.spyOn(request, 'text');
    expect((await DELETE(request)).status).toBe(403);
    expect(json).not.toHaveBeenCalled();
    expect(text).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
