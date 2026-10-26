// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readSession: vi.fn(), getSharedDatabase: vi.fn(), listTypes: vi.fn(), createType: vi.fn(), updateType: vi.fn(), listEntitlements: vi.fn(), setEntitlement: vi.fn(), deleteEntitlement: vi.fn(), listHolidays: vi.fn(), addHoliday: vi.fn(), renameHoliday: vi.fn(), deleteHoliday: vi.fn(), getMinWorkingDays: vi.fn(), setMinWorkingDays: vi.fn() }));
vi.mock('../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({
  ...await importOriginal<typeof import('@backoffice/core')>(),
  LeaveSettingsService: class {
    listTypes = mocks.listTypes; createType = mocks.createType; updateType = mocks.updateType; listEntitlements = mocks.listEntitlements; setEntitlement = mocks.setEntitlement; deleteEntitlement = mocks.deleteEntitlement;
    listHolidays = mocks.listHolidays; addHoliday = mocks.addHoliday; renameHoliday = mocks.renameHoliday; deleteHoliday = mocks.deleteHoliday; getMinWorkingDays = mocks.getMinWorkingDays; setMinWorkingDays = mocks.setMinWorkingDays;
  }
}));

import { GET as LIST_TYPES, POST as CREATE_TYPE } from './route';
import { PUT as UPDATE_TYPE } from './[leaveTypeId]/route';
import { DELETE as DELETE_ENTITLEMENT, GET as LIST_ENTITLEMENTS, PUT as SET_ENTITLEMENT } from '../entitlements/route';
import { GET as LIST_HOLIDAYS, POST as ADD_HOLIDAY } from '../holidays/route';
import { DELETE as DELETE_HOLIDAY, PUT as RENAME_HOLIDAY } from '../holidays/[date]/route';
import { GET as GET_SETTINGS, PUT as SET_SETTINGS } from '../settings/route';

const manager = { authenticated: true, personId: 'hr-a', roles: [{ name: 'hr-manager', organizationId: null }], dataOwnerModules: ['hr'], hospitalWideDataOwnerModules: ['hr'] };
const staff = { authenticated: true, personId: 'person-a', roles: [{ name: 'staff', organizationId: null }], dataOwnerModules: [] };
const request = (method: string, value?: unknown, url = 'http://localhost/api/leave/x') => new Request(url, { method, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
const type = { name: 'ลาอุปสมบท', counting: 'WORKING_DAYS', approvalTarget: 'HOSPITAL', attachmentRequiredFromDays: null, isActive: true, sortOrder: 6 };
const entitlement = { employmentTypeId: 'et-1', leaveTypeId: 'lt-1', daysPerYear: 10, firstYearDays: null, maxAccumulatedDays: null, maxAccumulatedDaysAfter10Years: null, minServiceMonths: 0 };
const dateParams = { params: Promise.resolve({ date: '2026-12-05' }) };

afterEach(() => vi.clearAllMocks());
function as(session: unknown) { mocks.readSession.mockResolvedValue(session); mocks.getSharedDatabase.mockReturnValue({}); }

describe('leave settings routes', () => {
  it('rejects a signed-out user everywhere', async () => {
    as(null);
    for (const response of await Promise.all([LIST_TYPES(request('GET')), CREATE_TYPE(request('POST', {})), LIST_ENTITLEMENTS(request('GET')), LIST_HOLIDAYS(request('GET')), GET_SETTINGS(request('GET'))])) expect(response.status).toBe(401);
  });

  it('keeps every change to HR managers', async () => {
    as(staff);
    const responses = await Promise.all([
      CREATE_TYPE(request('POST', { code: 'ORDINATION', ...type })), UPDATE_TYPE(request('PUT', type), { params: Promise.resolve({ leaveTypeId: 'lt-1' }) }),
      LIST_ENTITLEMENTS(request('GET')), SET_ENTITLEMENT(request('PUT', entitlement)), DELETE_ENTITLEMENT(request('DELETE', { employmentTypeId: 'et-1', leaveTypeId: 'lt-1' })),
      ADD_HOLIDAY(request('POST', { date: '2026-12-05', name: 'วันพ่อ' })), RENAME_HOLIDAY(request('PUT', { name: 'วันชาติ' }), dateParams), DELETE_HOLIDAY(request('DELETE'), dateParams), SET_SETTINGS(request('PUT', { minWorkingDaysPerMonth: 16 }))
    ]);
    expect(responses.map((response) => response.status)).toEqual([403, 403, 403, 403, 403, 403, 403, 403, 403]);
  });

  it('lists active types to staff and every type to HR', async () => {
    mocks.listTypes.mockResolvedValue([]);
    as(staff);
    expect((await LIST_TYPES(request('GET'))).status).toBe(200);
    expect(mocks.listTypes).toHaveBeenLastCalledWith({ activeOnly: true });
    as(manager);
    await LIST_TYPES(request('GET'));
    expect(mocks.listTypes).toHaveBeenLastCalledWith({ activeOnly: false });
  });

  it('creates and updates a type, with 409 for a duplicate and 400 for bad input', async () => {
    as(manager);
    mocks.createType.mockResolvedValueOnce({ ok: true, id: 'lt-9' }).mockResolvedValueOnce({ ok: false, code: 'DUPLICATE_CODE' });
    expect((await CREATE_TYPE(request('POST', { code: 'ORDINATION', ...type }))).status).toBe(201);
    expect(mocks.createType).toHaveBeenCalledWith({ code: 'ORDINATION', ...type }, 'hr-a');
    expect((await CREATE_TYPE(request('POST', { code: 'ORDINATION', ...type }))).status).toBe(409);
    expect((await CREATE_TYPE(request('POST', { code: 'bad', ...type }))).status).toBe(400);
    mocks.updateType.mockResolvedValueOnce({ ok: false, code: 'NOT_FOUND' });
    expect((await UPDATE_TYPE(request('PUT', type), { params: Promise.resolve({ leaveTypeId: 'lt-1' }) })).status).toBe(404);
  });

  it('sets and deletes an entitlement', async () => {
    as(manager);
    mocks.setEntitlement.mockResolvedValue({ ok: true });
    mocks.deleteEntitlement.mockResolvedValue({ ok: true });
    expect((await SET_ENTITLEMENT(request('PUT', entitlement))).status).toBe(200);
    expect((await SET_ENTITLEMENT(request('PUT', { ...entitlement, daysPerYear: 2.25 }))).status).toBe(400);
    expect((await DELETE_ENTITLEMENT(request('DELETE', { employmentTypeId: 'et-1', leaveTypeId: 'lt-1' }))).status).toBe(200);
    expect(mocks.deleteEntitlement).toHaveBeenCalledWith('et-1', 'lt-1', 'hr-a');
  });

  it('keeps holidays and the minimum working days', async () => {
    as(manager);
    mocks.listHolidays.mockResolvedValue([{ date: '2026-12-05', name: 'วันพ่อ' }]);
    mocks.addHoliday.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false, code: 'DUPLICATE_DATE' });
    mocks.renameHoliday.mockResolvedValue({ ok: true });
    mocks.deleteHoliday.mockResolvedValue({ ok: false, code: 'NOT_FOUND' });
    mocks.getMinWorkingDays.mockResolvedValue(15);
    mocks.setMinWorkingDays.mockResolvedValue({ ok: true });
    expect(await (await LIST_HOLIDAYS(request('GET', undefined, 'http://localhost/api/leave/holidays?year=2026'))).json()).toEqual({ holidays: [{ date: '2026-12-05', name: 'วันพ่อ' }] });
    expect(mocks.listHolidays).toHaveBeenCalledWith(2026);
    expect((await LIST_HOLIDAYS(request('GET', undefined, 'http://localhost/api/leave/holidays?year=abc'))).status).toBe(400);
    expect((await ADD_HOLIDAY(request('POST', { date: '2026-12-05', name: 'วันพ่อ' }))).status).toBe(201);
    expect((await ADD_HOLIDAY(request('POST', { date: '2026-12-05', name: 'วันพ่อ' }))).status).toBe(409);
    expect((await RENAME_HOLIDAY(request('PUT', { name: 'วันชาติ' }), dateParams)).status).toBe(200);
    expect(mocks.renameHoliday).toHaveBeenCalledWith('2026-12-05', 'วันชาติ', 'hr-a');
    expect((await DELETE_HOLIDAY(request('DELETE'), dateParams)).status).toBe(404);
    expect(await (await GET_SETTINGS(request('GET'))).json()).toEqual({ minWorkingDaysPerMonth: 15 });
    expect((await SET_SETTINGS(request('PUT', { minWorkingDaysPerMonth: 40 }))).status).toBe(400);
    expect((await SET_SETTINGS(request('PUT', { minWorkingDaysPerMonth: 16 }))).status).toBe(200);
  });
});
