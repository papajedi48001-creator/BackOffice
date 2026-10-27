import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ headers: vi.fn(), redirect: vi.fn(), notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND'); }), refresh: vi.fn(), readSession: vi.fn(), getSharedDatabase: vi.fn(), getOrganization: vi.fn(), listPeople: vi.fn(), listOrganizations: vi.fn(), deletionImpact: vi.fn(), push: vi.fn() }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, notFound: mocks.notFound, useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }) }));
vi.mock('../../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), HrDirectory: class { getOrganization = mocks.getOrganization; listPeople = mocks.listPeople; listOrganizations = mocks.listOrganizations; }, OrganizationStructureService: class { deletionImpact = mocks.deletionImpact; } }));

import OrganizationPage from './page';

const hrManager = { authenticated: true, personId: 'manager', roles: [{ name: 'hr-manager', organizationId: null }], dataOwnerModules: ['hr'], hospitalWideDataOwnerModules: ['hr'] };
const hrReader = { authenticated: true, personId: 'reader', roles: [{ name: 'hr-reader', organizationId: null }], dataOwnerModules: [] };
const unit = {
  id: 'nur', code: 'NUR', name: 'กลุ่มการพยาบาล', unitType: 'DIVISION', headPersonId: 'p2', headActive: true,
  headHistory: [
    { personId: 'p2', displayName: 'นางสาวมาลี ดีงาม', employeeCode: 'E002', effectiveFrom: '2026-05-31T17:00:00Z', effectiveUntil: null },
    { personId: 'p1', displayName: 'นายสมศักดิ์ รักงาน', employeeCode: 'E001', effectiveFrom: '2025-12-31T17:00:00Z', effectiveUntil: '2026-05-31T17:00:00Z' }
  ]
};

function ready(session: unknown) {
  mocks.headers.mockResolvedValue(new Headers());
  mocks.readSession.mockResolvedValue(session);
  mocks.getSharedDatabase.mockReturnValue({ query: vi.fn() });
  mocks.getOrganization.mockResolvedValue(unit);
  mocks.listPeople.mockResolvedValue([
    { id: 'p1', employeeCode: 'E001', displayName: 'นายสมศักดิ์ รักงาน', employmentStatus: 'ACTIVE' },
    { id: 'p9', employeeCode: 'E009', displayName: 'ลาออกแล้ว', employmentStatus: 'INACTIVE' }
  ]);
  mocks.listOrganizations.mockResolvedValue([
    { id: 'nur', name: 'กลุ่มการพยาบาล', parentId: 'hosp', unitType: 'DIVISION' },
    { id: 'med', name: 'กลุ่มงานการแพทย์', parentId: 'hosp', unitType: 'DIVISION' },
    { id: 'ipd', name: 'งานผู้ป่วยใน', parentId: 'nur', unitType: 'SECTION' }
  ]);
  mocks.deletionImpact.mockResolvedValue({ units: 2, people: 5 });
}
const page = (organizationId = 'nur') => OrganizationPage({ params: Promise.resolve({ organizationId }) });

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('OrganizationPage', () => {
  it('shows the unit type, current head and head history in Bangkok dates to an hr reader without forms', async () => {
    ready(hrReader);

    render(await page());

    expect(screen.getByRole('heading', { name: 'กลุ่มการพยาบาล' })).toBeInTheDocument();
    expect(screen.getByText('กลุ่มงาน')).toBeInTheDocument();
    expect(screen.getAllByText('นางสาวมาลี ดีงาม (E002)')[0]).toBeInTheDocument();
    expect(screen.getAllByRole('cell', { name: '1 มิ.ย. 2569' })).toHaveLength(2);
    expect(screen.getByRole('cell', { name: '1 ม.ค. 2569' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'บันทึกชนิดหน่วยงาน' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ตั้งเป็นหัวหน้า' })).not.toBeInTheDocument();
    expect(mocks.listPeople).not.toHaveBeenCalled();
  });

  it('gives an hr manager the unit type and head forms with active people only', async () => {
    ready(hrManager);

    render(await page());

    expect(screen.getByRole('combobox', { name: 'ชนิดหน่วยงาน' })).toHaveValue('DIVISION');
    expect(screen.getByRole('button', { name: 'บันทึกชนิดหน่วยงาน' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'หัวหน้าคนใหม่' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ตั้งเป็นหัวหน้า' })).toBeInTheDocument();
    expect(document.querySelector('option[value="E001 นายสมศักดิ์ รักงาน"]')).not.toBeNull();
    expect(document.querySelector('option[value="E009 ลาออกแล้ว"]')).toBeNull();
  });

  it('names the head of a hospital unit ผู้อำนวยการ', async () => {
    ready(hrManager);
    mocks.getOrganization.mockResolvedValue({ ...unit, unitType: 'HOSPITAL', headActive: false });

    render(await page());

    expect(screen.getByText('ผู้อำนวยการ', { selector: 'dt' })).toBeInTheDocument();
    expect(screen.getByText('ผู้อำนวยการพ้นสภาพ')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'ประวัติผู้อำนวยการ' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'ผู้อำนวยการ' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'ผู้อำนวยการคนใหม่' })).toBeInTheDocument();
    expect(screen.getByLabelText('วันที่เริ่มเป็นผู้อำนวยการ')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ตั้งเป็นผู้อำนวยการ' })).toBeInTheDocument();
    expect(screen.queryByText(/หัวหน้า/)).not.toBeInTheDocument();
  });

  it('says a hospital unit has no director yet', async () => {
    ready(hrReader);
    mocks.getOrganization.mockResolvedValue({ ...unit, unitType: 'HOSPITAL', headPersonId: null, headHistory: [] });

    render(await page());

    expect(screen.getByText('ยังไม่มีผู้อำนวยการ')).toBeInTheDocument();
    expect(screen.getByText('ยังไม่เคยตั้งผู้อำนวยการ')).toBeInTheDocument();
  });

  it('warns when the current head is no longer active', async () => {
    ready(hrReader);
    mocks.getOrganization.mockResolvedValue({ ...unit, headActive: false });

    render(await page());

    expect(screen.getByText('หัวหน้าพ้นสภาพ')).toBeInTheDocument();
  });

  it('shows not found for an unknown organization', async () => {
    ready(hrReader);
    mocks.getOrganization.mockResolvedValue(null);

    await expect(page('missing')).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('shows no data to a person without HR read permission', async () => {
    ready({ authenticated: true, personId: 'staff', roles: [], dataOwnerModules: [] });

    render(await page());

    expect(screen.getByRole('alert')).toHaveTextContent('คุณไม่มีสิทธิ์ดูข้อมูลส่วนนี้');
    expect(mocks.getOrganization).not.toHaveBeenCalled();
  });

  it('lets an HR manager rename a งาน and move it to another กลุ่มงาน', async () => {
    ready(hrManager);
    mocks.getOrganization.mockResolvedValue({ ...unit, id: 'ipd', name: 'งานผู้ป่วยใน', unitType: 'SECTION', parentId: 'nur' });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    render(await page('ipd'));

    expect(screen.getByLabelText('ชื่องาน')).toHaveValue('งานผู้ป่วยใน');
    expect(screen.getByRole('combobox', { name: 'อยู่ในกลุ่มงาน' })).toHaveValue('nur');
    fireEvent.change(screen.getByLabelText('ชื่องาน'), { target: { value: 'งานผู้ป่วยในชาย' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'อยู่ในกลุ่มงาน' }), { target: { value: 'med' } });
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกชื่อ' }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/hr/organizations/ipd');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({ name: 'งานผู้ป่วยในชาย', parentId: 'med' });
  });

  it('confirms a delete with what it affects, then returns to the list', async () => {
    ready(hrManager);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, units: 2, people: 5 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    render(await page());

    expect(screen.queryByRole('combobox', { name: 'อยู่ในกลุ่มงาน' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'ลบกลุ่มงานนี้' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('ลบ 2 หน่วยงาน (รวมงานที่อยู่ใต้กลุ่มงานนี้) บุคลากร 5 คนจะไม่มีสังกัด');
    fireEvent.click(screen.getByRole('button', { name: 'ยืนยันการลบ' }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/hr/organizations'));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/hr/organizations/nur');
    expect(init.method).toBe('DELETE');
  });
});
