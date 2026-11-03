// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readSession: vi.fn(), getSharedDatabase: vi.fn(), readRuntimeValue: vi.fn(), fetch: vi.fn(), addGroup: vi.fn(), setRoute: vi.fn(), overview: vi.fn() }));
vi.mock('../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('../../../../lib/runtime-env', () => ({ readRuntimeValue: mocks.readRuntimeValue }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), LineService: class { addGroup = mocks.addGroup; setRoute = mocks.setRoute; overview = mocks.overview; } }));

import { POST as ADD_GROUP } from './groups/route';
import { POST as TEST } from './groups/[groupId]/test/route';
import { PUT as SET_ROUTE } from './routes/[code]/route';

const admin = { authenticated: true, personId: 'person-admin', roles: [{ name: 'admin', organizationId: null }], dataOwnerModules: [] };
const manager = { authenticated: true, personId: 'person-m', roles: [{ name: 'room-manager', organizationId: null }], dataOwnerModules: [] };
const group = `C${'cd'.repeat(16)}`;
const json = (method: string, value: unknown = {}) => new Request('http://localhost/api/admin/line/x', { method, body: JSON.stringify(value) });
const params = <T extends object>(value: T) => ({ params: Promise.resolve(value) });
const ready = (session: object = admin) => { mocks.readSession.mockResolvedValue(session); mocks.getSharedDatabase.mockReturnValue({}); mocks.readRuntimeValue.mockImplementation((name: string) => (name === 'LINE_CHANNEL_ACCESS_TOKEN' ? 'token' : undefined)); vi.stubGlobal('fetch', mocks.fetch); };

afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); });

describe('ตั้งค่า LINE API', () => {
  it('refuses anyone who is not ผู้ดูแลระบบ before touching data', async () => {
    ready(manager);
    expect((await ADD_GROUP(json('POST', { groupId: group, displayName: 'x' }))).status).toBe(403);
    expect((await SET_ROUTE(json('PUT', { groupId: group }), params({ code: 'room-booking' }))).status).toBe(403);
    expect((await TEST(json('POST'), params({ groupId: group }))).status).toBe(403);
    expect(mocks.addGroup).not.toHaveBeenCalled();
    expect(mocks.setRoute).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('adds a group typed by hand and refuses a malformed id', async () => {
    ready();
    mocks.addGroup.mockResolvedValue({ ok: true });
    expect((await ADD_GROUP(json('POST', { groupId: group, displayName: 'หัวหน้างาน' }))).status).toBe(201);
    expect(mocks.addGroup).toHaveBeenCalledWith('person-admin', { groupId: group, displayName: 'หัวหน้างาน' });
    expect((await ADD_GROUP(json('POST', { groupId: 'C123', displayName: 'x' }))).status).toBe(400);
  });

  it('routes a live module to a group or to nothing, and refuses other modules and unknown groups', async () => {
    ready();
    mocks.setRoute.mockResolvedValue({ ok: true });
    expect((await SET_ROUTE(json('PUT', { groupId: group }), params({ code: 'room-booking' }))).status).toBe(200);
    expect((await SET_ROUTE(json('PUT', { groupId: null }), params({ code: 'leave' }))).status).toBe(200);
    expect(mocks.setRoute).toHaveBeenCalledWith('person-admin', 'leave', null);
    expect((await SET_ROUTE(json('PUT', { groupId: group }), params({ code: 'admin' }))).status).toBe(404);
    expect((await SET_ROUTE(json('PUT', { groupId: group }), params({ code: 'maintenance' }))).status).toBe(404);
    mocks.setRoute.mockResolvedValue({ ok: false, code: 'NOT_FOUND' });
    expect((await SET_ROUTE(json('PUT', { groupId: group }), params({ code: 'fleet' }))).status).toBe(404);
  });

  it('sends a test message to a group and says when LINE refuses or is not set up', async () => {
    ready();
    mocks.fetch.mockResolvedValueOnce(new Response('{}', { status: 200 })).mockResolvedValueOnce(new Response('{}', { status: 400 }));
    expect((await TEST(json('POST'), params({ groupId: group }))).status).toBe(200);
    const body = JSON.parse(String((mocks.fetch.mock.calls[0]![1] as RequestInit).body)) as { to: string; messages: Array<{ text: string }> };
    expect(body).toEqual({ to: group, messages: [{ type: 'text', text: 'ทดสอบการแจ้งเตือนจาก Back Office' }] });
    expect((await TEST(json('POST'), params({ groupId: group }))).status).toBe(502);
    expect((await TEST(json('POST'), params({ groupId: 'nope' }))).status).toBe(404);
    mocks.readRuntimeValue.mockReturnValue(undefined);
    expect((await TEST(json('POST'), params({ groupId: group }))).status).toBe(503);
  });
});
