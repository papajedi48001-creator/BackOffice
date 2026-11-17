// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readSession: vi.fn(), getSharedDatabase: vi.fn(), listPeople: vi.fn(), exportPeople: vi.fn() }));
vi.mock('../../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('../../../../../lib/bangkok-time', () => ({ bangkokToday: () => '2026-11-17' }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), HrDirectory: class { listPeople = mocks.listPeople; }, exportPeople: mocks.exportPeople }));

import { POST } from './route';

const base = { employmentStatus: 'ACTIVE', nationalIdMasked: 'X-XXXX-XXXXX-12-3', organizationCode: null, positionTitle: 'พยาบาลวิชาชีพ', organizationName: 'กลุ่มการพยาบาล' };
const people = [{ ...base, id: '1', employeeCode: 'RN001', displayName: 'นางมาลี ดีงาม', employmentTypeName: 'ข้าราชการ' }, { ...base, id: '2', employeeCode: 'RN002', displayName: 'นายสมชาย ใจดี', employmentTypeName: 'ลูกจ้างประจำ' }];
const admin = { authenticated: true, personId: 'admin-1', roles: [{ name: 'admin', organizationId: null }], dataOwnerModules: [] };
const request = (body: unknown) => new Request('http://localhost/api/hr/people/export', { method: 'POST', body: JSON.stringify(body) });

afterEach(() => vi.clearAllMocks());

describe('POST /api/hr/people/export', () => {
  it('sends the filtered people in scope as a CSV download', async () => {
    mocks.readSession.mockResolvedValue(admin);
    mocks.getSharedDatabase.mockReturnValue({});
    mocks.listPeople.mockResolvedValue(people);
    mocks.exportPeople.mockResolvedValue('﻿csv');
    const response = await POST(request({ query: 'สมชาย', employmentTypeName: 'ลูกจ้างประจำ' }));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="people-2026-11-17.csv"');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.listPeople).toHaveBeenCalledWith({ organizationIds: 'all' });
    expect(mocks.exportPeople).toHaveBeenCalledWith({}, 'admin-1', [people[1]]);
  });

  it('limits the rows to the units the exporter may read', async () => {
    mocks.readSession.mockResolvedValue({ authenticated: true, personId: 'x', roles: [{ name: 'data-exporter', organizationId: null }, { name: 'hr-reader', organizationId: 'unit-nur' }], dataOwnerModules: [] });
    mocks.getSharedDatabase.mockReturnValue({});
    mocks.listPeople.mockResolvedValue([]);
    mocks.exportPeople.mockResolvedValue('﻿');
    expect((await POST(request({}))).status).toBe(200);
    expect(mocks.listPeople).toHaveBeenCalledWith({ organizationIds: ['unit-nur'] });
  });

  it('refuses a reader without hospital-wide data.export, and an exporter who may read nobody', async () => {
    mocks.getSharedDatabase.mockReturnValue({});
    mocks.readSession.mockResolvedValue({ authenticated: true, personId: 'r', roles: [{ name: 'hr-reader', organizationId: null }], dataOwnerModules: [] });
    expect((await POST(request({}))).status).toBe(403);
    mocks.readSession.mockResolvedValue({ authenticated: true, personId: 'e', roles: [{ name: 'data-exporter', organizationId: 'unit-nur' }, { name: 'hr-reader', organizationId: 'unit-nur' }], dataOwnerModules: [] });
    expect((await POST(request({}))).status).toBe(403);
    mocks.readSession.mockResolvedValue({ authenticated: true, personId: 'e', roles: [{ name: 'data-exporter', organizationId: null }], dataOwnerModules: [] });
    expect((await POST(request({}))).status).toBe(403);
    expect(mocks.exportPeople).not.toHaveBeenCalled();
  });

  it('needs a session and rejects a body that is not filter text', async () => {
    mocks.readSession.mockResolvedValueOnce(null);
    expect((await POST(request({}))).status).toBe(401);
    mocks.readSession.mockResolvedValue(admin);
    mocks.getSharedDatabase.mockReturnValue({});
    expect((await POST(request({ query: 5 }))).status).toBe(400);
    expect((await POST(request({ extra: 'x' }))).status).toBe(400);
  });
});
