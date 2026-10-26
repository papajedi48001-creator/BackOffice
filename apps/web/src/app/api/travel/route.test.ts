// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readSession: vi.fn(), getSharedDatabase: vi.fn(), submit: vi.fn(), resubmit: vi.fn(), cancel: vi.fn(), detail: vi.fn(), people: vi.fn(), setApprovalTarget: vi.fn() }));
vi.mock('../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({
  ...await importOriginal<typeof import('@backoffice/core')>(),
  OfficialTravelService: class { submit = mocks.submit; resubmit = mocks.resubmit; cancel = mocks.cancel; },
  OfficialTravelQueries: class { detail = mocks.detail; people = mocks.people; },
  TravelSettingsService: class { setApprovalTarget = mocks.setApprovalTarget; }
}));

import { POST } from './route';
import { GET as DETAIL, PUT as RESUBMIT } from './[travelId]/route';
import { POST as CANCEL } from './[travelId]/cancellation/route';
import { GET as PEOPLE } from './people/route';
import { PUT as SET_TYPE } from './types/[code]/route';

const staff = { authenticated: true, personId: 'person-a', roles: [{ name: 'staff', organizationId: null }], dataOwnerModules: [] };
const hr = { authenticated: true, personId: 'person-h', roles: [{ name: 'hr-manager', organizationId: null }], dataOwnerModules: ['hr'], hospitalWideDataOwnerModules: ['hr'] };
const body = { subject: 'ประชุม', organiser: 'สสจ.', place: 'ศาลากลาง', province: 'มหาสารคาม', travelType: 'IN_PROVINCE', vehicle: 'GOVERNMENT_CAR', fundingSource: 'NONE', startDate: '2026-11-10', endDate: '2026-11-10', memberPersonIds: ['person-b'] };
const json = (url: string, method: string, value: unknown) => new Request(url, { method, body: JSON.stringify(value) });
const params = <T extends object>(value: T) => ({ params: Promise.resolve(value) });
const ready = (session: object = staff) => { mocks.readSession.mockResolvedValue(session); mocks.getSharedDatabase.mockReturnValue({}); };

afterEach(() => vi.clearAllMocks());

describe('POST /api/travel', () => {
  it('rejects a signed-out user', async () => {
    mocks.readSession.mockResolvedValueOnce(null);
    expect((await POST(json('http://localhost/api/travel', 'POST', body))).status).toBe(401);
  });

  it('files as the signed-in หัวหน้าคณะ, never one named in the body', async () => {
    ready();
    mocks.submit.mockResolvedValueOnce({ ok: true, travelId: 'travel-1' });
    const response = await POST(json('http://localhost/api/travel', 'POST', { ...body, leaderPersonId: 'person-z', personId: 'person-z' }));
    expect(response.status).toBe(201);
    expect(mocks.submit.mock.calls[0]?.[0]).toBe('person-a');
    expect(mocks.submit.mock.calls[0]?.[1]).not.toHaveProperty('leaderPersonId');
  });

  it('names the person a rule failed for', async () => {
    ready();
    mocks.submit.mockResolvedValueOnce({ ok: false, code: 'OVERLAPS_LEAVE', personId: 'person-b' });
    const response = await POST(json('http://localhost/api/travel', 'POST', body));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'OVERLAPS_LEAVE', personId: 'person-b' });
  });
});

describe('/api/travel/[travelId]', () => {
  it('hides a trip the viewer may not see', async () => {
    ready();
    mocks.detail.mockResolvedValueOnce(null);
    expect((await DETAIL(new Request('http://localhost/api/travel/travel-1'), params({ travelId: 'travel-1' }))).status).toBe(404);
    expect(mocks.detail).toHaveBeenCalledWith('travel-1', staff);
  });

  it('resubmits as the signed-in person', async () => {
    ready();
    mocks.resubmit.mockResolvedValueOnce({ ok: false, code: 'NOT_FOUND' });
    expect((await RESUBMIT(json('http://localhost/api/travel/travel-1', 'PUT', body), params({ travelId: 'travel-1' }))).status).toBe(404);
    expect(mocks.resubmit.mock.calls[0]?.slice(0, 2)).toEqual(['person-a', 'travel-1']);
  });

  it('cancels with a reason and answers 409 when nothing is waiting', async () => {
    ready();
    expect((await CANCEL(json('http://localhost/api/travel/travel-1/cancellation', 'POST', {}), params({ travelId: 'travel-1' }))).status).toBe(400);
    mocks.cancel.mockResolvedValueOnce({ ok: false, code: 'NOT_PENDING' });
    expect((await CANCEL(json('http://localhost/api/travel/travel-1/cancellation', 'POST', { reason: 'งานเลื่อน' }), params({ travelId: 'travel-1' }))).status).toBe(409);
    expect(mocks.cancel).toHaveBeenCalledWith('person-a', 'travel-1', 'งานเลื่อน');
  });
});

describe('GET /api/travel/people', () => {
  it('searches by the q text', async () => {
    ready();
    mocks.people.mockResolvedValueOnce([{ personId: 'person-b', displayName: 'นางสาวพรทิพย์', organizationName: 'งานผู้ป่วยใน' }]);
    const response = await PEOPLE(new Request('http://localhost/api/travel/people?q=%E0%B8%9E%E0%B8%A3'));
    await expect(response.json()).resolves.toEqual({ people: [{ personId: 'person-b', displayName: 'นางสาวพรทิพย์', organizationName: 'งานผู้ป่วยใน' }] });
    expect(mocks.people).toHaveBeenCalledWith('พร');
  });
});

describe('PUT /api/travel/types/[code]', () => {
  it('needs travel.manage', async () => {
    ready();
    expect((await SET_TYPE(json('http://localhost/api/travel/types/ABROAD', 'PUT', { approvalTarget: 'DIVISION' }), params({ code: 'ABROAD' }))).status).toBe(403);
    ready(hr);
    mocks.setApprovalTarget.mockResolvedValueOnce({ ok: true });
    expect((await SET_TYPE(json('http://localhost/api/travel/types/ABROAD', 'PUT', { approvalTarget: 'DIVISION' }), params({ code: 'ABROAD' }))).status).toBe(200);
    expect(mocks.setApprovalTarget).toHaveBeenCalledWith('person-h', 'ABROAD', { approvalTarget: 'DIVISION' });
  });
});
