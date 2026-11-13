// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readSession: vi.fn(), getSharedDatabase: vi.fn(), saveMember: vi.fn(), removeMember: vi.fn(), people: vi.fn() }));
vi.mock('../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({
  ...await importOriginal<typeof import('@backoffice/core')>(),
  MoneyMemberService: class { saveMember = mocks.saveMember; removeMember = mocks.removeMember; },
  AdminQueries: class { people = mocks.people; }
}));

import { PUT as SAVE_MEMBER } from './members/route';
import { DELETE as REMOVE_MEMBER } from './members/[personId]/route';
import { GET as PEOPLE } from './people/route';

const uuid = '0b6f3c1e-5d1a-4c8e-9a51-2f7c1d9e8b10';
const staff = { authenticated: true, personId: 'person-a', roles: [], dataOwnerModules: [] };
const manager = { ...staff, roles: [{ name: 'money-manager', organizationId: null }] };
const put = (value: unknown) => new Request('http://localhost/api/money/members', { method: 'PUT', body: JSON.stringify(value) });
const ready = (session: object | null) => { mocks.readSession.mockResolvedValue(session); mocks.getSharedDatabase.mockReturnValue({ query: vi.fn() }); };

afterEach(() => vi.resetAllMocks());

describe('Smart Money member routes', () => {
  it('answers 401 when signed out', async () => {
    ready(null);
    expect((await SAVE_MEMBER(put({ personId: uuid, pages: ['dental'] }))).status).toBe(401);
  });

  it('answers 400 for a member without pages, naming the field', async () => {
    ready(manager);
    const response = await SAVE_MEMBER(put({ personId: uuid, pages: [] }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_input', fields: ['pages'] });
  });

  it('maps service results to statuses', async () => {
    ready(manager);
    mocks.saveMember.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false, code: 'FORBIDDEN' }).mockResolvedValueOnce({ ok: false, code: 'NOT_FOUND' });
    expect((await SAVE_MEMBER(put({ personId: uuid, pages: ['dental'] }))).status).toBe(200);
    expect(mocks.saveMember).toHaveBeenCalledWith(manager, { personId: uuid, pages: ['dental'] });
    expect((await SAVE_MEMBER(put({ personId: uuid, pages: ['dental'] }))).status).toBe(403);
    expect((await SAVE_MEMBER(put({ personId: uuid, pages: ['dental'] }))).status).toBe(404);
  });

  it('removes a member and answers 404 for an unknown one', async () => {
    ready(manager);
    mocks.removeMember.mockResolvedValueOnce({ ok: false, code: 'NOT_FOUND' });
    const response = await REMOVE_MEMBER(new Request(`http://localhost/api/money/members/${uuid}`, { method: 'DELETE' }), { params: Promise.resolve({ personId: uuid }) });
    expect(response.status).toBe(404);
    expect(mocks.removeMember).toHaveBeenCalledWith(manager, uuid);
  });

  it('lets only a manager search people', async () => {
    ready(staff);
    expect((await PEOPLE(new Request('http://localhost/api/money/people?q=สม'))).status).toBe(403);
    ready(manager);
    mocks.people.mockResolvedValue([{ personId: uuid, displayName: 'สมชาย' }]);
    const response = await PEOPLE(new Request('http://localhost/api/money/people?q=สม'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ people: [{ personId: uuid, displayName: 'สมชาย' }] });
  });
});
