// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readSession: vi.fn(), getSharedDatabase: vi.fn(), enabled: vi.fn(), upload: vi.fn(), open: vi.fn() }));
vi.mock('../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('../../../lib/attachments', async (importOriginal) => ({ ...await importOriginal<typeof import('../../../lib/attachments')>(), attachmentsEnabled: mocks.enabled, attachmentService: () => ({ uploadAttachment: mocks.upload, openAttachment: mocks.open }) }));

import { POST } from './route';
import { GET } from './[attachmentId]/download/route';

const staff = { authenticated: true, personId: 'person-a', roles: [{ name: 'staff', organizationId: null }], dataOwnerModules: [] };
const pdf = new TextEncoder().encode('%PDF-1.7 x');
function form(file: File | null) { const body = new FormData(); if (file) body.append('file', file); return new Request('http://localhost/api/attachments', { method: 'POST', body }); }
const ready = () => { mocks.readSession.mockResolvedValue(staff); mocks.getSharedDatabase.mockReturnValue({}); mocks.enabled.mockReturnValue(true); };
const download = (id = 'att-1') => GET(new Request(`http://localhost/api/attachments/${id}/download`), { params: Promise.resolve({ attachmentId: id }) });

afterEach(() => vi.clearAllMocks());

describe('POST /api/attachments', () => {
  it('rejects a signed-out user', async () => {
    mocks.readSession.mockResolvedValue(null);
    expect((await POST(form(new File([pdf], 'a.pdf', { type: 'application/pdf' })))).status).toBe(401);
  });

  it('answers 503 while storage is not configured', async () => {
    ready();
    mocks.enabled.mockReturnValue(false);
    const response = await POST(form(new File([pdf], 'a.pdf', { type: 'application/pdf' })));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'object_storage_not_configured' });
  });

  it('stores a file for the session person and answers its id and name', async () => {
    ready();
    mocks.upload.mockResolvedValue({ id: 'att-1', objectKey: 'attachments/x', contentType: 'application/pdf', sizeBytes: pdf.byteLength, createdByPersonId: 'person-a', filename: 'ใบรับรองแพทย์.pdf' });
    const response = await POST(form(new File([pdf], 'ใบรับรองแพทย์.pdf', { type: 'application/pdf' })));
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ attachmentId: 'att-1', filename: 'ใบรับรองแพทย์.pdf', contentType: 'application/pdf', sizeBytes: pdf.byteLength });
    expect(mocks.upload).toHaveBeenCalledWith({ actorPersonId: 'person-a', filename: 'ใบรับรองแพทย์.pdf', contentType: 'application/pdf', bytes: pdf });
  });

  it('names each refusal', async () => {
    ready();
    expect((await POST(form(null))).status).toBe(400);
    expect((await POST(form(new File(['MZ'], 'a.exe', { type: 'application/x-msdownload' })))).status).toBe(415);
    const big = await POST(form(new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.pdf', { type: 'application/pdf' })));
    expect(big.status).toBe(413);
    expect(mocks.upload).not.toHaveBeenCalled();
    for (const [code, status] of [['INVALID_FILE_CONTENT', 422], ['FILE_INFECTED', 422], ['SCAN_UNAVAILABLE', 503]] as const) {
      mocks.upload.mockRejectedValueOnce(new Error(code));
      const response = await POST(form(new File([pdf], 'a.pdf', { type: 'application/pdf' })));
      expect(response.status).toBe(status);
      await expect(response.json()).resolves.toEqual({ error: code });
    }
  });
});

describe('GET /api/attachments/[id]/download', () => {
  it('answers the bytes with safe headers to someone allowed', async () => {
    ready();
    mocks.open.mockResolvedValue({ attachment: { id: 'att-1', objectKey: 'attachments/x', contentType: 'application/pdf', sizeBytes: pdf.byteLength, createdByPersonId: 'person-a', filename: 'report.pdf' }, bytes: pdf });
    const response = await download();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toBe(`attachment; filename="report.pdf"; filename*=UTF-8''report.pdf`);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(pdf);
    expect(mocks.open.mock.calls[0]?.[0]).toEqual({ attachmentId: 'att-1', actorPersonId: 'person-a' });
  });

  it('answers 404 to anyone else, and 401 when signed out', async () => {
    ready();
    mocks.open.mockRejectedValue(new Error('NOT_FOUND'));
    expect((await download()).status).toBe(404);
    mocks.readSession.mockResolvedValue(null);
    expect((await download()).status).toBe(401);
  });
});
