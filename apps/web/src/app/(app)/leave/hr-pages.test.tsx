import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ headers: vi.fn(), redirect: vi.fn(), refresh: vi.fn(), readSession: vi.fn(), getSharedDatabase: vi.fn(), listTypes: vi.fn(), listEntitlements: vi.fn(), listHolidays: vi.fn(), getMinWorkingDays: vi.fn(), allLeave: vi.fn(), listEmploymentTypes: vi.fn() }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock('../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({
  ...await importOriginal<typeof import('@backoffice/core')>(),
  LeaveSettingsService: class { listTypes = mocks.listTypes; listEntitlements = mocks.listEntitlements; listHolidays = mocks.listHolidays; getMinWorkingDays = mocks.getMinWorkingDays; },
  LeaveQueries: class { allLeave = mocks.allLeave; },
  EmploymentTypeService: class { list = mocks.listEmploymentTypes; }
}));

import AllLeavePage from './all/page';
import LeaveSettingsPage from './settings/page';
import LeaveHolidaysPage from './holidays/page';
import LeaveBalancesPage from './balances/page';

const manager = { authenticated: true, personId: 'hr-a', roles: [{ name: 'hr-manager', organizationId: null }], dataOwnerModules: ['hr'], hospitalWideDataOwnerModules: ['hr'] };
const staff = { authenticated: true, personId: 'person-a', roles: [], dataOwnerModules: [] };
const vacation = { id: 'lt-3', code: 'VACATION', name: 'ลาพักผ่อน', counting: 'WORKING_DAYS', approvalTarget: 'HOSPITAL', attachmentRequiredFromDays: null, isActive: true, sortOrder: 3 };
const civil = { id: 'et-1', code: 'CIVIL_SERVANT', name: 'ข้าราชการ', isActive: true, sortOrder: 1 };
const query = (value: Record<string, string> = {}) => ({ searchParams: Promise.resolve(value) });
function as(session: unknown) {
  mocks.headers.mockResolvedValue(new Headers());
  mocks.readSession.mockResolvedValue(session);
  mocks.getSharedDatabase.mockReturnValue({});
  mocks.listTypes.mockResolvedValue([vacation]);
  mocks.listEntitlements.mockResolvedValue([{ employmentTypeId: 'et-1', leaveTypeId: 'lt-3', daysPerYear: 10, firstYearDays: null, maxAccumulatedDays: 20, maxAccumulatedDaysAfter10Years: 30, minServiceMonths: 6 }]);
  mocks.listHolidays.mockResolvedValue([{ date: '2026-12-05', name: 'วันพ่อแห่งชาติ' }]);
  mocks.getMinWorkingDays.mockResolvedValue(15);
  mocks.allLeave.mockResolvedValue([]);
  mocks.listEmploymentTypes.mockResolvedValue([civil]);
}

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('HR leave pages', () => {
  it('shows staff no access on every HR page', async () => {
    as(staff);
    for (const page of [await AllLeavePage(query()), await LeaveSettingsPage(), await LeaveHolidaysPage(query()), await LeaveBalancesPage()]) {
      const { unmount } = render(page);
      expect(screen.getByRole('alert')).toHaveTextContent('คุณไม่มีสิทธิ์ดูข้อมูลส่วนนี้');
      unmount();
    }
    expect(mocks.allLeave).not.toHaveBeenCalled();
    expect(mocks.listEntitlements).not.toHaveBeenCalled();
  });

  it('lists every ใบลา with filters and a CSV download that needs a reason', async () => {
    as(manager);
    render(await AllLeavePage(query({ from: '2026-11-01', to: '2026-11-30', status: 'APPROVED' })));
    expect(mocks.allLeave).toHaveBeenCalledWith({ from: '2026-11-01', to: '2026-11-30', status: 'APPROVED' });
    const download = screen.getByRole('form', { name: 'ดาวน์โหลด CSV' });
    expect(download).toHaveAttribute('action', '/api/leave/all');
    expect(within(download).getByLabelText('เหตุผลการส่งออก')).toBeRequired();
  });

  it('edits types, entitlements and the minimum working days', async () => {
    as(manager);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(await LeaveSettingsPage());
    expect(screen.getByRole('form', { name: 'แก้ไขประเภทการลา ลาพักผ่อน' })).toBeInTheDocument();
    const entitlement = screen.getByRole('form', { name: 'สิทธิ์การลา ข้าราชการ ลาพักผ่อน' });
    expect(within(entitlement).getByLabelText('วันต่อปี')).toHaveValue(10);
    fireEvent.change(within(entitlement).getByLabelText('วันต่อปี'), { target: { value: '12' } });
    fireEvent.click(within(entitlement).getByRole('button', { name: 'บันทึกสิทธิ์' }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe('/api/leave/entitlements');
    expect(JSON.parse(init.body as string)).toEqual({ employmentTypeId: 'et-1', leaveTypeId: 'lt-3', daysPerYear: 12, firstYearDays: null, maxAccumulatedDays: 20, maxAccumulatedDaysAfter10Years: 30, minServiceMonths: 6 });
    expect(screen.getByRole('spinbutton', { name: 'วันทำการขั้นต่ำต่อเดือน' })).toHaveValue(15);
  });

  it('lists the year’s holidays and adds one', async () => {
    as(manager);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: 'DUPLICATE_DATE' }), { status: 409 }));
    vi.stubGlobal('fetch', fetchMock);
    render(await LeaveHolidaysPage(query({ year: '2026' })));
    expect(mocks.listHolidays).toHaveBeenCalledWith(2026);
    expect(screen.getByDisplayValue('วันพ่อแห่งชาติ')).toBeInTheDocument();
    const add = screen.getByRole('form', { name: 'เพิ่มวันหยุด' });
    fireEvent.change(within(add).getByLabelText('วันที่'), { target: { value: '2026-12-05' } });
    fireEvent.change(within(add).getByLabelText('ชื่อวันหยุด'), { target: { value: 'ซ้ำ' } });
    fireEvent.click(within(add).getByRole('button', { name: 'เพิ่มวันหยุด' }));
    expect(await within(add).findByText('วันที่นี้มีอยู่แล้ว')).toBeInTheDocument();
  });

  it('downloads the balance template and shows import row errors in Thai', async () => {
    as(manager);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: false, errors: [{ row: 3, column: 'leave_type', code: 'UNKNOWN_LEAVE_TYPE' }] }), { status: 422 }));
    vi.stubGlobal('fetch', fetchMock);
    render(await LeaveBalancesPage());
    expect(screen.getByRole('form', { name: 'ดาวน์โหลดไฟล์ยอดวันลา' })).toHaveAttribute('action', '/api/leave/balances');
    const upload = screen.getByRole('form', { name: 'นำเข้าไฟล์ยอดวันลา' });
    const fileInput = within(upload).getByLabelText('ไฟล์ CSV');
    Object.defineProperty(fileInput, 'files', { value: [new File(['employee_code'], 'b.csv', { type: 'text/csv' })] });
    fireEvent.change(fileInput);
    // jsdom keeps its own FileList, so the required check would block a click; submit the form directly.
    fireEvent.submit(upload);
    expect(await within(upload).findByText(/แถว 3 · leave_type: ไม่พบประเภทการลานี้/)).toBeInTheDocument();
    expect((fetchMock.mock.calls[0]! as unknown as [string])[0]).toBe('/api/leave/balances');
  });
});
