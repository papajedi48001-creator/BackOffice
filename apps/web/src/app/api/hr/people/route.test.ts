// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readSession: vi.fn(), getSharedDatabase: vi.fn(), getNationalIdProtector: vi.fn(), create: vi.fn(), updateIdentity: vi.fn(), setPassword: vi.fn(), createAccount: vi.fn() }));
vi.mock('../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('../../../../lib/national-id', () => ({ getNationalIdProtector: mocks.getNationalIdProtector }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), PersonAccountService: class { create = mocks.create; updateIdentity = mocks.updateIdentity; setPassword = mocks.setPassword; createAccount = mocks.createAccount; } }));

import { POST as postPerson } from './route';
import { POST as postAccount } from './[personId]/account/route';
import { PUT as putIdentity } from './[personId]/identity/route';
import { PUT as putPassword } from './[personId]/password/route';

const manager = { authenticated: true, personId: 'person-a', roles: [{ name: 'hr-manager', organizationId: null }], dataOwnerModules: ['hr'] };
const params = { params: Promise.resolve({ personId: 'person-b' }) };
const request = (method: string, body: unknown) => new Request('http://localhost/api/hr/people', { method, body: typeof body === 'string' ? body : JSON.stringify(body) });
const newPerson = { nationalId: '1101700230708', firstName: 'สมใจ', lastName: 'ใจดี', username: 'somjai', password: 'long-enough-1' };

afterEach(() => vi.clearAllMocks());
const ready = () => { mocks.readSession.mockResolvedValue(manager); mocks.getSharedDatabase.mockReturnValue({}); mocks.getNationalIdProtector.mockReturnValue({}); };

describe('POST /api/hr/people', () => {
  it('needs a session, a database and the national ID key', async () => {
    mocks.readSession.mockResolvedValueOnce(null);
    expect((await postPerson(request('POST', newPerson))).status).toBe(401);
    mocks.readSession.mockResolvedValue(manager);
    mocks.getSharedDatabase.mockReturnValue({});
    mocks.getNationalIdProtector.mockReturnValueOnce(null);
    expect((await postPerson(request('POST', newPerson))).status).toBe(503);
  });

  it('creates the person and answers with the new id', async () => {
    ready();
    mocks.create.mockResolvedValueOnce({ ok: true, id: 'person-new' });
    const response = await postPerson(request('POST', newPerson));
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ ok: true, id: 'person-new' });
    expect(mocks.create).toHaveBeenCalledWith(newPerson, manager);
  });

  it('names only the bad fields, never echoing a national ID or password', async () => {
    ready();
    const response = await postPerson(request('POST', { ...newPerson, nationalId: '1234567890123', password: 'short' }));
    expect(response.status).toBe(400);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({ error: 'invalid_input', fields: ['nationalId', 'password'] });
    expect(body).not.toContain('1234567890123');
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('maps refusals to statuses', async () => {
    ready();
    for (const [code, status] of [['FORBIDDEN', 403], ['DUPLICATE_USERNAME', 409], ['DUPLICATE_NATIONAL_ID', 409], ['DUPLICATE_EMPLOYEE_CODE', 409], ['UNKNOWN_POSITION', 400]] as const) {
      mocks.create.mockResolvedValueOnce({ ok: false, code });
      const response = await postPerson(request('POST', newPerson));
      expect(response.status).toBe(status);
      await expect(response.json()).resolves.toEqual({ error: code });
    }
  });
});

describe('identity, password and account of an existing person', () => {
  it('refuses a username change, since it never changes', async () => {
    ready();
    const response = await putIdentity(request('PUT', { username: 'renamed' }), params);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'invalid_input', fields: ['username'] });
    expect(mocks.updateIdentity).not.toHaveBeenCalled();
  });

  it('saves identity fields for the session actor', async () => {
    ready();
    mocks.updateIdentity.mockResolvedValueOnce({ ok: true });
    expect((await putIdentity(request('PUT', { employmentStatus: 'INACTIVE', employeeCode: 'E9' }), params)).status).toBe(200);
    expect(mocks.updateIdentity).toHaveBeenCalledWith('person-b', { employmentStatus: 'INACTIVE', employeeCode: 'E9' }, manager);
    mocks.updateIdentity.mockResolvedValueOnce({ ok: false, code: 'DUPLICATE_EMPLOYEE_CODE' });
    expect((await putIdentity(request('PUT', { employeeCode: 'E1' }), params)).status).toBe(409);
  });

  it('sets a password and maps a person without an account', async () => {
    ready();
    mocks.setPassword.mockResolvedValueOnce({ ok: true });
    expect((await putPassword(request('PUT', { password: 'brand-new-pass' }), params)).status).toBe(200);
    expect(mocks.setPassword).toHaveBeenCalledWith('person-b', 'brand-new-pass', manager);
    mocks.setPassword.mockResolvedValueOnce({ ok: false, code: 'NO_ACCOUNT' });
    expect((await putPassword(request('PUT', { password: 'brand-new-pass' }), params)).status).toBe(409);
    expect((await putPassword(request('PUT', { password: 'short' }), params)).status).toBe(400);
  });

  it('adds an account to a person who has none', async () => {
    ready();
    mocks.createAccount.mockResolvedValueOnce({ ok: true });
    expect((await postAccount(request('POST', { username: 'somjai', password: 'long-enough-1' }), params)).status).toBe(201);
    mocks.createAccount.mockResolvedValueOnce({ ok: false, code: 'ACCOUNT_EXISTS' });
    expect((await postAccount(request('POST', { username: 'somjai', password: 'long-enough-1' }), params)).status).toBe(409);
  });
});
