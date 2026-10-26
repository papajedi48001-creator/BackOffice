import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ headers: vi.fn(), redirect: vi.fn(), refresh: vi.fn(), readSession: vi.fn(), getSharedDatabase: vi.fn(), list: vi.fn() }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock('../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), EmploymentTypeService: class { list = mocks.list; } }));

import EmploymentTypesPage from './page';

const manager = { authenticated: true, personId: 'manager', roles: [{ name: 'hr-manager', organizationId: null }], dataOwnerModules: ['hr'], hospitalWideDataOwnerModules: ['hr'] };
const names = ['ข้าราชการ', 'พนักงานราชการ', 'พนักงานกระทรวงสาธารณสุข (พกส.)', 'ลูกจ้างประจำ', 'ลูกจ้างชั่วคราว', 'ลูกจ้างรายวัน'];
const types = names.map((name, index) => ({ id: `t${index + 1}`, code: `CODE_${index + 1}`, name, isActive: index !== 4, sortOrder: index + 1 }));

function ready(session: unknown) {
  mocks.headers.mockResolvedValue(new Headers());
  mocks.readSession.mockResolvedValue(session);
  mocks.getSharedDatabase.mockReturnValue({ query: vi.fn() });
  mocks.list.mockResolvedValue(types);
}

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('EmploymentTypesPage', () => {
  it('refuses anyone who cannot manage employment types', async () => {
    ready({ authenticated: true, personId: 'reader', roles: [{ name: 'hr-reader', organizationId: null }], dataOwnerModules: [] });
    render(await EmploymentTypesPage());
    expect(screen.getByRole('alert')).toHaveTextContent('คุณไม่มีสิทธิ์ดูข้อมูลส่วนนี้');
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it('lists every type with its status, an edit form per type and an add form', async () => {
    ready(manager);
    render(await EmploymentTypesPage());
    expect(screen.getByRole('heading', { name: 'ประเภทการจ้าง' })).toBeInTheDocument();
    expect(screen.getAllByRole('form', { name: /^แก้ไขประเภทการจ้าง/ })).toHaveLength(6);
    const temporary = screen.getByRole('form', { name: 'แก้ไขประเภทการจ้าง ลูกจ้างชั่วคราว' });
    expect(within(temporary).getByLabelText('ใช้งาน')).not.toBeChecked();
    expect(screen.getByRole('form', { name: 'เพิ่มประเภทการจ้าง' })).toBeInTheDocument();
  });

  it('shows the Thai duplicate message when a rename collides', async () => {
    ready(manager);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: 'DUPLICATE_NAME' }), { status: 409 }));
    vi.stubGlobal('fetch', fetchMock);
    render(await EmploymentTypesPage());

    const daily = screen.getByRole('form', { name: 'แก้ไขประเภทการจ้าง ลูกจ้างรายวัน' });
    fireEvent.change(within(daily).getByLabelText('ชื่อประเภท'), { target: { value: 'ข้าราชการ' } });
    fireEvent.click(within(daily).getByRole('button', { name: 'บันทึก' }));

    expect(await within(daily).findByRole('alert')).toHaveTextContent('รหัสหรือชื่อประเภทนี้มีอยู่แล้ว');
    const [url, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe('/api/hr/employment-types/t6');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({ code: 'CODE_6', name: 'ข้าราชการ', isActive: true, sortOrder: 6 });
  });

  it('adds a type with the next sort order and refreshes', async () => {
    ready(manager);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, id: 't7' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(await EmploymentTypesPage());

    const add = screen.getByRole('form', { name: 'เพิ่มประเภทการจ้าง' });
    fireEvent.change(within(add).getByLabelText('รหัส'), { target: { value: 'INTERN' } });
    fireEvent.change(within(add).getByLabelText('ชื่อประเภท'), { target: { value: 'นักศึกษาฝึกงาน' } });
    fireEvent.click(within(add).getByRole('button', { name: 'เพิ่มประเภทการจ้าง' }));

    await vi.waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe('/api/hr/employment-types');
    expect(JSON.parse(init.body as string)).toEqual({ code: 'INTERN', name: 'นักศึกษาฝึกงาน', isActive: true, sortOrder: 7 });
  });
});
