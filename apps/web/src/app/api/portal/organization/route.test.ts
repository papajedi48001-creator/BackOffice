// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OidcError } from '@backoffice/core';

const mocks = vi.hoisted(() => ({ config: vi.fn(), providerConfig: vi.fn(), getSharedDatabase: vi.fn(), verify: vi.fn(), findLink: vi.fn(), isActivePerson: vi.fn(), namesOf: vi.fn(), phoneOf: vi.fn(), departments: vi.fn(), protector: vi.fn(), match: vi.fn() }));
vi.mock('../../../../lib/provider-sso', () => ({ portalSsoConfig: mocks.config, providerSsoConfig: mocks.providerConfig, portalOidcClient: () => ({ verifyPortalRequest: mocks.verify }) }));
vi.mock('../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('../../../../lib/national-id', () => ({ getNationalIdProtector: mocks.protector }));
vi.mock('@backoffice/core', async (importOriginal) => ({
  ...await importOriginal<typeof import('@backoffice/core')>(),
  HrProfileService: class { currentOrganizationNamesOf = mocks.namesOf; phoneOf = mocks.phoneOf; portalDepartmentNames = mocks.departments; },
  NationalIdHashMatcher: class { findActivePerson = mocks.match; },
  DatabaseExternalIdentityRepository: class { findLink = mocks.findLink; isActivePerson = mocks.isActivePerson; }
}));

import { GET } from './route';

const hash = 'b'.repeat(64);
const config = { issuer: 'https://portal.test', clientId: 'backoffice' };
const get = (authorization: string | null = 'Bearer signed.request.token') => GET(new Request('http://localhost/api/portal/organization', { headers: authorization ? { authorization } : {} }));
const ready = () => {
  mocks.config.mockReturnValue(config); mocks.getSharedDatabase.mockReturnValue({}); mocks.protector.mockReturnValue({});
  mocks.verify.mockResolvedValue({ memberId: 'member-1', provider: { issuer: 'https://provider.id.th', subject: 'acc-1' } });
  mocks.providerConfig.mockReturnValue({ apiUrl: 'https://provider.id.th' });
  mocks.findLink.mockResolvedValue({ personId: 'person-1' }); mocks.isActivePerson.mockResolvedValue(true);
  mocks.namesOf.mockResolvedValue(['งานผู้ป่วยใน', 'กลุ่มงานการพยาบาล', 'โรงพยาบาลวาริชภูมิ']);
  mocks.phoneOf.mockResolvedValue('0812345678');
  mocks.departments.mockResolvedValue(['กลุ่มงานการพยาบาล', 'งานผู้ป่วยใน']);
};

afterEach(() => vi.clearAllMocks());

describe('GET /api/portal/organization', () => {
  it('does not exist while the portal is not set up', async () => {
    mocks.config.mockReturnValue(null);
    expect((await get()).status).toBe(404);
  });

  it('refuses a request without a valid portal-signed หน่วยงาน token', async () => {
    ready();
    expect((await get(null)).status).toBe(401);
    mocks.verify.mockRejectedValueOnce(new OidcError('INVALID'));
    expect((await get()).status).toBe(401);
    expect(mocks.verify).toHaveBeenCalledWith('signed.request.token', 'backoffice-organization-request+jwt');
    mocks.verify.mockRejectedValueOnce(new OidcError('UNAVAILABLE'));
    expect((await get()).status).toBe(503);
    expect(mocks.namesOf).not.toHaveBeenCalled();
  });

  it('answers the หน่วยงาน names of the บุคลากร linked to the Provider ID account', async () => {
    ready();
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ organizations: ['งานผู้ป่วยใน', 'กลุ่มงานการพยาบาล', 'โรงพยาบาลวาริชภูมิ'], phone: '0812345678', departments: ['กลุ่มงานการพยาบาล', 'งานผู้ป่วยใน'] });
    expect(mocks.findLink).toHaveBeenCalledWith('https://provider.id.th', 'acc-1');
    expect(mocks.namesOf).toHaveBeenCalledWith('person-1');
    expect(mocks.match).not.toHaveBeenCalled();
  });

  it('finds an unlinked บุคลากร by hash_cid, without linking', async () => {
    ready();
    mocks.verify.mockResolvedValue({ memberId: 'member-1', provider: { issuer: 'https://provider.id.th', subject: 'acc-1' }, hashCid: hash });
    mocks.findLink.mockResolvedValue(null);
    mocks.match.mockResolvedValue('person-9');
    expect((await get()).status).toBe(200);
    expect(mocks.match).toHaveBeenCalledWith(hash);
    expect(mocks.namesOf).toHaveBeenCalledWith('person-9');
  });

  it('still lists every หน่วยงาน when nobody matches, so the portal can sync its department list', async () => {
    ready();
    mocks.findLink.mockResolvedValue(null);
    const response = await get();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ organizations: [], phone: null, departments: ['กลุ่มงานการพยาบาล', 'งานผู้ป่วยใน'] });
    expect(mocks.namesOf).not.toHaveBeenCalled();
  });

  it('answers 404 when nobody matches, the person is inactive, the keys are missing or there is no หน่วยงาน', async () => {
    ready();
    mocks.departments.mockResolvedValue([]);
    mocks.findLink.mockResolvedValue(null);
    expect((await get()).status).toBe(404);
    mocks.verify.mockResolvedValue({ memberId: 'member-1', provider: null, hashCid: hash });
    mocks.protector.mockReturnValueOnce(null);
    expect((await get()).status).toBe(404);
    expect(mocks.match).not.toHaveBeenCalled();
    mocks.match.mockResolvedValueOnce(null);
    expect((await get()).status).toBe(404);
    mocks.findLink.mockResolvedValue({ personId: 'person-1' });
    mocks.isActivePerson.mockResolvedValueOnce(false);
    mocks.match.mockResolvedValueOnce(null);
    expect((await get()).status).toBe(404);
    mocks.namesOf.mockResolvedValueOnce([]);
    mocks.phoneOf.mockResolvedValueOnce(null);
    expect((await get()).status).toBe(404);
  });

  it('answers the phone alone when the person has no หน่วยงาน, and no phone when none is recorded', async () => {
    ready();
    mocks.namesOf.mockResolvedValueOnce([]);
    expect(await (await get()).json()).toEqual({ organizations: [], phone: '0812345678', departments: ['กลุ่มงานการพยาบาล', 'งานผู้ป่วยใน'] });
    mocks.phoneOf.mockResolvedValueOnce(null);
    expect(await (await get()).json()).toEqual({ organizations: ['งานผู้ป่วยใน', 'กลุ่มงานการพยาบาล', 'โรงพยาบาลวาริชภูมิ'], phone: null, departments: ['กลุ่มงานการพยาบาล', 'งานผู้ป่วยใน'] });
  });

  it('ignores a Provider ID account from another environment', async () => {
    ready();
    mocks.providerConfig.mockReturnValue({ apiUrl: 'https://uat-provider.id.th' });
    await get();
    expect(mocks.findLink).toHaveBeenCalledTimes(1);
    expect(mocks.findLink).toHaveBeenCalledWith('https://portal.test', 'member-1');
  });
});
