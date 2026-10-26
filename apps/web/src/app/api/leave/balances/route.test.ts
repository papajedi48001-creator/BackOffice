// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readSession: vi.fn(), getSharedDatabase: vi.fn(), exportLeaveBalancesCsv: vi.fn(), apply: vi.fn(), allLeave: vi.fn(), requestExport: vi.fn() }));
vi.mock('../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({
  ...await importOriginal<typeof import('@backoffice/core')>(),
  exportLeaveBalancesCsv: mocks.exportLeaveBalancesCsv,
  LeaveBalanceImportService: class { apply = mocks.apply; },
  LeaveQueries: class { allLeave = mocks.allLeave; },
  ExportService: class { requestExport = mocks.requestExport; }
}));

import { GET as DOWNLOAD, POST as IMPORT } from './route';
import { GET as ALL } from '../all/route';

const manager = { authenticated: true, personId: 'hr-a', roles: [{ name: 'hr-manager', organizationId: null }], dataOwnerModules: ['hr'], hospitalWideDataOwnerModules: ['hr'] };
const staff = { authenticated: true, personId: 'person-a', roles: [], dataOwnerModules: [] };
const database = { transaction: async (work: (db: unknown) => unknown) => work(database), execute: vi.fn(), query: vi.fn() };
function as(session: unknown) { mocks.readSession.mockResolvedValue(session); mocks.getSharedDatabase.mockReturnValue(database); }
const upload = (csv: string, fiscalYear = '2570') => { const form = new FormData(); form.set('fiscalYear', fiscalYear); form.set('file', new File([csv], 'balances.csv', { type: 'text/csv' })); return IMPORT(new Request('http://localhost/api/leave/balances', { method: 'POST', body: form })); };

afterEach(() => vi.clearAllMocks());

describe('GET /api/leave/balances', () => {
  it('needs an HR manager, a fiscal year and a reason', async () => {
    as(null);
    expect((await DOWNLOAD(new Request('http://localhost/api/leave/balances?fiscalYear=2570&reason=x'))).status).toBe(401);
    as(staff);
    expect((await DOWNLOAD(new Request('http://localhost/api/leave/balances?fiscalYear=2570&reason=x'))).status).toBe(403);
    as(manager);
    expect((await DOWNLOAD(new Request('http://localhost/api/leave/balances?fiscalYear=2570'))).status).toBe(400);
    expect((await DOWNLOAD(new Request('http://localhost/api/leave/balances?reason=x'))).status).toBe(400);
    expect(mocks.requestExport).not.toHaveBeenCalled();
  });

  it('records the export before returning the file', async () => {
    as(manager);
    mocks.exportLeaveBalancesCsv.mockResolvedValue('\uFEFFemployee_code\r\n');
    const response = await DOWNLOAD(new Request('http://localhost/api/leave/balances?fiscalYear=2570&reason=%E0%B8%9B%E0%B8%A3%E0%B8%B1%E0%B8%9A%E0%B8%A2%E0%B8%AD%E0%B8%94'));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="leave-balances-2570.csv"');
    expect(mocks.requestExport).toHaveBeenCalledWith({ actorPersonId: 'hr-a', reason: 'ปรับยอด', moduleCode: 'leave', scope: { fiscalYear: 2570, dataset: 'balances' } });
  });
});

describe('POST /api/leave/balances', () => {
  it('imports a file for HR managers and returns row errors as 422', async () => {
    as(staff);
    expect((await upload('x')).status).toBe(403);
    as(manager);
    mocks.apply.mockResolvedValueOnce({ ok: true, rowsChanged: 3 }).mockResolvedValueOnce({ ok: false, errors: [{ row: 2, column: 'leave_type', code: 'UNKNOWN_LEAVE_TYPE' }] });
    const applied = await upload('employee_code\r\n');
    expect(applied.status).toBe(200);
    await expect(applied.json()).resolves.toEqual({ ok: true, rowsChanged: 3 });
    expect(mocks.apply).toHaveBeenCalledWith('employee_code\r\n', 2570, 'hr-a');
    expect((await upload('employee_code\r\n')).status).toBe(422);
    expect((await upload('employee_code\r\n', 'abc')).status).toBe(400);
  });
});

describe('GET /api/leave/all', () => {
  it('exports every ใบลา without reasons or contacts', async () => {
    as(manager);
    mocks.allLeave.mockResolvedValue([{ requestId: 'r1', reference: 'REQ-r1', kind: 'LEAVE', leaveTypeName: 'ลาพักผ่อน', startDate: '2026-11-02', endDate: '2026-11-03', startHalf: 'FULL', endHalf: 'FULL', days: 2, status: 'APPROVED', submittedAt: '2026-10-20T01:00:00Z', personDisplayName: 'สมชาย', organizationName: 'งานผู้ป่วยใน' }]);
    const response = await ALL(new Request('http://localhost/api/leave/all?from=2026-11-01&to=2026-11-30&reason=audit'));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="leave-2026-11-01-2026-11-30.csv"');
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder().decode(bytes);
    expect(text.split('\r\n')[0]).toBe('reference,display_name,organization,leave_type,kind,start_date,start_half,end_date,end_half,days,status,submitted_at');
    expect(text).not.toMatch(/reason|contact/);
    expect(mocks.allLeave).toHaveBeenCalledWith({ from: '2026-11-01', to: '2026-11-30' });
    as(staff);
    expect((await ALL(new Request('http://localhost/api/leave/all?from=2026-11-01&to=2026-11-30&reason=audit'))).status).toBe(403);
  });
});
