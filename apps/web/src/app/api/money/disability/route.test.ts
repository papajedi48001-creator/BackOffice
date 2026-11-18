// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readSession: vi.fn(), getSharedDatabase: vi.fn(), upload: vi.fn(), summaries: vi.fn(), all: vi.fn(), removeYear: vi.fn(), cipher: vi.fn() }));
vi.mock('../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('../../../../lib/national-id', () => ({ getNationalIdProtector: mocks.cipher }));
vi.mock('@backoffice/core', async (importOriginal) => ({
  ...await importOriginal<typeof import('@backoffice/core')>(),
  DpRecordService: class { upload = mocks.upload; summaries = mocks.summaries; all = mocks.all; removeYear = mocks.removeYear; }
}));

import { DELETE, GET, POST } from './records/route';

const manager = { authenticated: true, personId: 'person-a', roles: [{ name: 'money-manager', organizationId: null }], dataOwnerModules: [] };
const ready = (session: object | null) => { mocks.readSession.mockResolvedValue(session); mocks.getSharedDatabase.mockReturnValue({ query: vi.fn() }); mocks.cipher.mockReturnValue(null); };
const url = 'http://localhost/api/money/disability/records';
const uploadId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const rows = [['เลขที่อ้างอิง', 'ชื่อบริการฟื้นฟู']];
const post = (value: unknown) => new Request(url, { method: 'POST', body: JSON.stringify(value) });
const remove = (value: unknown) => new Request(url, { method: 'DELETE', body: JSON.stringify(value) });

afterEach(() => vi.resetAllMocks());

describe('Point ฟื้นฟูผู้พิการ record routes', () => {
  it('answers 401 when signed out', async () => {
    ready(null);
    expect((await GET(new Request(url))).status).toBe(401);
    expect((await POST(post({ fileName: 'a.csv', uploadId, rows }))).status).toBe(401);
    expect((await DELETE(remove({ fy: 2569 }))).status).toBe(401);
  });

  it('refuses a non-manager before reading the body, and caps the body at 2 MB', async () => {
    ready({ ...manager, roles: [] });
    const unread = post({ fileName: 'a.csv', uploadId, rows });
    expect((await POST(unread)).status).toBe(403);
    expect(unread.bodyUsed).toBe(false);
    ready(manager);
    const chunk = new Uint8Array(256 * 1024).fill(32);
    let sent = 0;
    const endless = new ReadableStream({ pull(controller) { sent += 1; if (sent > 40) controller.close(); else controller.enqueue(chunk); } });
    expect((await POST(new Request(url, { method: 'POST', body: endless, duplex: 'half' } as RequestInit))).status).toBe(413);
    expect(sent).toBeLessThan(12);
    expect((await POST(post({ fileName: 'a.csv', uploadId: 'x', rows }))).status).toBe(400);
    expect((await POST(post({ fileName: 'a.csv', uploadId, rows: Array(1502).fill(['x']) }))).status).toBe(400);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('returns the import result, the parser message as 400 and the missing key as 503', async () => {
    ready(manager);
    const done = { ok: true, hcode: '11093', hname: 'รพ.ทดสอบ', rows: 2, skipped: 1, added: 1, updated: 1, years: { 2569: 2 } };
    mocks.upload
      .mockResolvedValueOnce(done)
      .mockResolvedValueOnce({ ok: false, code: 'INVALID_REPORT', message: 'ไฟล์ขาดคอลัมน์: วันที่รับบริการ' })
      .mockResolvedValueOnce({ ok: false, code: 'NOT_CONFIGURED', message: 'ยังไม่ได้ตั้งค่ากุญแจ' });
    expect(await (await POST(post({ fileName: 'a.csv', uploadId, rows }))).json()).toEqual(done);
    expect(mocks.upload).toHaveBeenCalledWith(manager, { fileName: 'a.csv', uploadId, rows });
    const invalid = await POST(post({ fileName: 'a.csv', uploadId, rows }));
    expect([invalid.status, await invalid.json()]).toEqual([400, { error: 'INVALID_REPORT', message: 'ไฟล์ขาดคอลัมน์: วันที่รับบริการ' }]);
    const missing = await POST(post({ fileName: 'a.csv', uploadId, rows }));
    expect([missing.status, await missing.json()]).toEqual([503, { error: 'NOT_CONFIGURED', message: 'ยังไม่ได้ตั้งค่ากุญแจ' }]);
  });

  it('lists ปีงบ summaries or every record, uncached, and 403 for someone without the page', async () => {
    ready(manager);
    mocks.summaries.mockResolvedValueOnce({ ok: true, years: [{ fy: 2569 }] });
    mocks.all.mockResolvedValueOnce({ ok: true, years: [{ fy: 2569 }], records: [{ ref: '1' }] }).mockResolvedValueOnce({ ok: false, code: 'FORBIDDEN' });
    expect(await (await GET(new Request(url))).json()).toEqual({ years: [{ fy: 2569 }] });
    const full = await GET(new Request(`${url}?full=1`));
    expect(await full.json()).toEqual({ years: [{ fy: 2569 }], records: [{ ref: '1' }] });
    expect(full.headers.get('cache-control')).toBe('no-store');
    expect((await GET(new Request(`${url}?full=1`))).status).toBe(403);
  });

  it('removes one ปีงบ given in the body', async () => {
    ready(manager);
    mocks.removeYear.mockResolvedValueOnce({ ok: true, records: 4 }).mockResolvedValueOnce({ ok: false, code: 'NOT_FOUND' });
    expect(await (await DELETE(remove({ fy: 2569 }))).json()).toEqual({ ok: true, records: 4 });
    expect(mocks.removeYear).toHaveBeenCalledWith(manager, 2569);
    expect((await DELETE(remove({ fy: 2569 }))).status).toBe(404);
    expect((await DELETE(remove({ fy: '2569' }))).status).toBe(400);
    expect((await DELETE(new Request(url, { method: 'DELETE', body: 'not json' }))).status).toBe(400);
  });

  it('refuses a delete from a non-manager without reading the body', async () => {
    ready({ ...manager, roles: [] });
    const request = remove({ fy: 2569 });
    expect((await DELETE(request)).status).toBe(403);
    expect(request.bodyUsed).toBe(false);
    expect(mocks.removeYear).not.toHaveBeenCalled();
  });
});
