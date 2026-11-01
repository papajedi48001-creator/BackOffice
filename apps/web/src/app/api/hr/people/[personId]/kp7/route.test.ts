// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readSession: vi.fn(), getSharedDatabase: vi.fn(), enabled: vi.fn(), upload: vi.fn(), setKp7File: vi.fn(), updateFamily: vi.fn() }));
vi.mock('../../../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('../../../../../../lib/attachments', async (importOriginal) => ({ ...await importOriginal<typeof import('../../../../../../lib/attachments')>(), attachmentsEnabled: mocks.enabled, attachmentService: () => ({ uploadAttachment: mocks.upload }) }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), HrProfileService: class { setKp7File = mocks.setKp7File; updateFamily = mocks.updateFamily; } }));

import { PUT as putFamily } from '../family/route';
import { DELETE as deleteKp7, POST as postKp7 } from './route';

const staff = { authenticated: true, personId: 'person-self', roles: [], dataOwnerModules: [] };
const params = { params: Promise.resolve({ personId: 'person-self' }) };
const pdf = new TextEncoder().encode('%PDF-1.7\n');
function form(file: File | null) { const body = new FormData(); if (file) body.append('file', file); return new Request('http://localhost/api/hr/people/person-self/kp7', { method: 'POST', body }); }
const ready = () => { mocks.readSession.mockResolvedValue(staff); mocks.getSharedDatabase.mockReturnValue({}); mocks.enabled.mockReturnValue(true); };

afterEach(() => vi.clearAllMocks());

describe('POST /api/hr/people/[personId]/kp7', () => {
  it('needs a session and storage', async () => {
    mocks.readSession.mockResolvedValueOnce(null);
    expect((await postKp7(form(new File([pdf], 'kp7.pdf', { type: 'application/pdf' })), params)).status).toBe(401);
    ready();
    mocks.enabled.mockReturnValue(false);
    expect((await postKp7(form(new File([pdf], 'kp7.pdf', { type: 'application/pdf' })), params)).status).toBe(503);
  });

  it('takes only a PDF up to 10 MB', async () => {
    ready();
    expect((await postKp7(form(new File([new Uint8Array(8)], 'a.png', { type: 'image/png' })), params)).status).toBe(415);
    expect((await postKp7(form(new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.pdf', { type: 'application/pdf' })), params)).status).toBe(413);
    expect((await postKp7(form(null), params)).status).toBe(400);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('stores the file as the session person and attaches it to the profile', async () => {
    ready();
    mocks.upload.mockResolvedValue({ id: 'file-1' });
    mocks.setKp7File.mockResolvedValue({ ok: true });
    const response = await postKp7(form(new File([pdf], 'กพ7.pdf', { type: 'application/pdf' })), params);
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ attachmentId: 'file-1' });
    expect(mocks.upload).toHaveBeenCalledWith(expect.objectContaining({ actorPersonId: 'person-self', contentType: 'application/pdf' }));
    expect(mocks.setKp7File).toHaveBeenCalledWith('person-self', 'file-1', staff);
  });

  it('passes on a refusal and an infected file', async () => {
    ready();
    mocks.upload.mockResolvedValueOnce({ id: 'file-1' });
    mocks.setKp7File.mockResolvedValueOnce({ ok: false, code: 'FORBIDDEN' });
    expect((await postKp7(form(new File([pdf], 'k.pdf', { type: 'application/pdf' })), params)).status).toBe(403);
    mocks.upload.mockRejectedValueOnce(new Error('FILE_INFECTED'));
    const infected = await postKp7(form(new File([pdf], 'k.pdf', { type: 'application/pdf' })), params);
    expect(infected.status).toBe(422);
    await expect(infected.json()).resolves.toEqual({ error: 'FILE_INFECTED' });
  });

  it('removes the file', async () => {
    ready();
    mocks.setKp7File.mockResolvedValue({ ok: true });
    expect((await deleteKp7(new Request('http://localhost', { method: 'DELETE' }), params)).status).toBe(200);
    expect(mocks.setKp7File).toHaveBeenCalledWith('person-self', null, staff);
  });
});

describe('PUT /api/hr/people/[personId]/family', () => {
  const put = (body: unknown) => putFamily(new Request('http://localhost', { method: 'PUT', body: JSON.stringify(body) }), params);
  it('saves valid family details for the session actor and names only bad fields', async () => {
    ready();
    mocks.updateFamily.mockResolvedValue({ ok: true });
    expect((await put({ maritalStatus: 'SINGLE', childrenCount: 0 })).status).toBe(200);
    expect(mocks.updateFamily).toHaveBeenCalledWith('person-self', { maritalStatus: 'SINGLE', childrenCount: 0 }, staff);
    const bad = await put({ childrenCount: 99, religion: 'พุทธ' });
    expect(bad.status).toBe(400);
    await expect(bad.json()).resolves.toEqual({ error: 'invalid_input', fields: ['childrenCount'] });
    mocks.updateFamily.mockResolvedValueOnce({ ok: false, code: 'FORBIDDEN' });
    expect((await put({ religion: 'พุทธ' })).status).toBe(403);
  });
});
