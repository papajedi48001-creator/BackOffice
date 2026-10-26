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
const sick = { id: 'lt-1', code: 'SICK', name: 'ลาป่วย', counting: 'WORKING_DAYS', approvalTarget: 'HOSPITAL', attachmentRequiredFromDays: 30, eligibleGender: null, isActive: true, sortOrder: 1 };
const vacation = { id: 'lt-3', code: 'VACATION', name: 'ลาพักผ่อน', counting: 'WORKING_DAYS', approvalTarget: 'HOSPITAL', attachmentRequiredFromDays: null, eligibleGender: null, isActive: true, sortOrder: 3 };
const civil = { id: 'et-1', code: 'CIVIL_SERVANT', name: 'ข้าราชการ', isActive: true, sortOrder: 1 };
const government = { id: 'et-2', code: 'GOVERNMENT_EMPLOYEE', name: 'พนักงานราชการ', isActive: true, sortOrder: 2 };
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
  mocks.listEmploymentTypes.mockResolvedValue([civil, government]);
}

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('HR leave pages', () => {
  it('shows staff no access on every HR page', async () => {
    as(staff);
    for (const page of [await AllLeavePage(query()), await LeaveSettingsPage(query()), await LeaveHolidaysPage(query()), await LeaveBalancesPage()]) {
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
    expect(download).toHaveAttribute('method', 'post');
    expect(within(download).getByLabelText('เหตุผลการส่งออก')).toBeRequired();
  });

  it('shows one ประเภทการจ้าง at a time, chosen from tabs at the top', async () => {
    as(manager);
    render(await LeaveSettingsPage(query()));
    const tabs = screen.getByRole('navigation', { name: 'ตั้งค่าการลา' });
    expect(within(tabs).getAllByRole('link').map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['ข้าราชการ', '/leave/settings?tab=et-1'], ['พนักงานราชการ', '/leave/settings?tab=et-2'], ['ประเภทการลาและวันทำการ', '/leave/settings?tab=types']
    ]);
    expect(within(tabs).getByRole('link', { name: 'ข้าราชการ' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('form', { name: 'สิทธิ์การลา ข้าราชการ ลาพักผ่อน' })).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'สิทธิ์การลา พนักงานราชการ ลาพักผ่อน' })).toBeNull();
    expect(screen.queryByRole('form', { name: 'แก้ไขประเภทการลา ลาพักผ่อน' })).toBeNull();
  });

  it('opens another ประเภทการจ้าง, or the leave types tab, from the query', async () => {
    as(manager);
    const { unmount } = render(await LeaveSettingsPage(query({ tab: 'et-2' })));
    expect(screen.getByRole('link', { name: 'พนักงานราชการ' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('form', { name: 'สิทธิ์การลา พนักงานราชการ ลาพักผ่อน' })).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'สิทธิ์การลา ข้าราชการ ลาพักผ่อน' })).toBeNull();
    unmount();
    render(await LeaveSettingsPage(query({ tab: 'types', type: 'lt-3' })));
    expect(screen.getByRole('form', { name: 'แก้ไขประเภทการลา ลาพักผ่อน' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'วันทำการขั้นต่ำต่อเดือน' })).toHaveValue(15);
    expect(screen.queryByRole('form', { name: 'สิทธิ์การลา ข้าราชการ ลาพักผ่อน' })).toBeNull();
  });

  it('shows one ประเภทการลา at a time from its own tabs, with a tab to add one', async () => {
    as(manager);
    mocks.listTypes.mockResolvedValue([sick, vacation]);
    const { unmount } = render(await LeaveSettingsPage(query({ tab: 'types' })));
    const typeTabs = screen.getByRole('navigation', { name: 'ประเภทการลา' });
    expect(within(typeTabs).getAllByRole('link').map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['ลาป่วย', '/leave/settings?tab=types&type=lt-1'], ['ลาพักผ่อน', '/leave/settings?tab=types&type=lt-3'], ['เพิ่มประเภทการลา', '/leave/settings?tab=types&type=new']
    ]);
    expect(within(typeTabs).getByRole('link', { name: 'ลาป่วย' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('form', { name: 'แก้ไขประเภทการลา ลาป่วย' })).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'แก้ไขประเภทการลา ลาพักผ่อน' })).toBeNull();
    expect(screen.queryByRole('form', { name: 'เพิ่มประเภทการลา' })).toBeNull();
    unmount();
    render(await LeaveSettingsPage(query({ tab: 'types', type: 'new' })));
    expect(screen.getByRole('form', { name: 'เพิ่มประเภทการลา' })).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'แก้ไขประเภทการลา ลาป่วย' })).toBeNull();
  });

  it('sets which gender a leave type is for', async () => {
    as(manager);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    mocks.listTypes.mockResolvedValue([{ ...vacation, id: 'lt-4', code: 'MATERNITY', name: 'ลาคลอดบุตร', eligibleGender: 'FEMALE' }]);
    render(await LeaveSettingsPage(query({ tab: 'types' })));
    const form = screen.getByRole('form', { name: 'แก้ไขประเภทการลา ลาคลอดบุตร' });
    const gender = within(form).getByLabelText('เฉพาะเพศ');
    expect(gender).toHaveValue('FEMALE');
    expect(within(gender).getAllByRole('option').map((option) => option.textContent)).toEqual(['ทุกเพศ', 'ชาย', 'หญิง']);
    fireEvent.change(gender, { target: { value: '' } });
    fireEvent.click(within(form).getByRole('button', { name: 'บันทึก' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string).eligibleGender).toBeNull();
  });

  it('falls back to the first ประเภทการจ้าง for an unknown tab', async () => {
    as(manager);
    render(await LeaveSettingsPage(query({ tab: 'nope' })));
    expect(screen.getByRole('link', { name: 'ข้าราชการ' })).toHaveAttribute('aria-current', 'page');
  });

  it('saves an entitlement from its tab', async () => {
    as(manager);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(await LeaveSettingsPage(query()));
    const entitlement = screen.getByRole('form', { name: 'สิทธิ์การลา ข้าราชการ ลาพักผ่อน' });
    expect(within(entitlement).getByLabelText('วันต่อปี')).toHaveValue(10);
    fireEvent.change(within(entitlement).getByLabelText('วันต่อปี'), { target: { value: '12' } });
    fireEvent.click(within(entitlement).getByRole('button', { name: 'บันทึกสิทธิ์' }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe('/api/leave/entitlements');
    expect(JSON.parse(init.body as string)).toEqual({ employmentTypeId: 'et-1', leaveTypeId: 'lt-3', daysPerYear: 12, firstYearDays: null, maxAccumulatedDays: 20, maxAccumulatedDaysAfter10Years: 30, minServiceMonths: 6 });
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
    expect(screen.getByRole('form', { name: 'ดาวน์โหลดไฟล์ยอดวันลา' })).toHaveAttribute('action', '/api/leave/balances/export');
    expect(screen.getByRole('form', { name: 'ดาวน์โหลดไฟล์ยอดวันลา' })).toHaveAttribute('method', 'post');
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
