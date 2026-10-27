import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), headers: vi.fn(), redirect: vi.fn(), readSession: vi.fn(), getSharedDatabase: vi.fn(), listOrganizations: vi.fn() }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock('../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), HrDirectory: class { listOrganizations = mocks.listOrganizations; } }));

import OrganizationsPage from './page';

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('OrganizationsPage', () => {
  it('nests each unit under its parent', async () => {
    mocks.headers.mockResolvedValue(new Headers());
    mocks.readSession.mockResolvedValue({ authenticated: true, personId: 'reader', roles: [{ name: 'hr-reader', organizationId: null }], dataOwnerModules: [] });
    mocks.getSharedDatabase.mockReturnValue({ query: vi.fn() });
    mocks.listOrganizations.mockResolvedValue([
      { id: 'nur', code: 'NUR', name: 'กลุ่มการพยาบาล', parentId: 'hosp', activePeople: 12 },
      { id: 'hosp', code: 'HOSP', name: 'โรงพยาบาลวาริชภูมิ', parentId: null, activePeople: 1 }
    ]);

    render(await OrganizationsPage());

    const hospital = screen.getByText('โรงพยาบาลวาริชภูมิ').closest('li')!;
    expect(within(hospital).getByText('กลุ่มการพยาบาล')).toBeInTheDocument();
    expect(within(hospital).getByText('บุคลากรปฏิบัติงาน 12 คน')).toBeInTheDocument();
  });

  it('shows each unit type and head, flags a unit without a head, and links to the unit', async () => {
    mocks.headers.mockResolvedValue(new Headers());
    mocks.readSession.mockResolvedValue({ authenticated: true, personId: 'reader', roles: [{ name: 'hr-reader', organizationId: null }], dataOwnerModules: [] });
    mocks.getSharedDatabase.mockReturnValue({ query: vi.fn() });
    mocks.listOrganizations.mockResolvedValue([
      { id: 'hosp', code: 'HOSP', name: 'โรงพยาบาลวาริชภูมิ', parentId: null, activePeople: 1, unitType: 'HOSPITAL', headPersonId: 'p1', headDisplayName: 'นพ.สมชาย ใจดี', headActive: true },
      { id: 'nur', code: 'NUR', name: 'กลุ่มการพยาบาล', parentId: 'hosp', activePeople: 12, unitType: 'DIVISION', headPersonId: null, headDisplayName: null }
    ]);

    render(await OrganizationsPage());

    const hospital = screen.getByRole('link', { name: 'โรงพยาบาลวาริชภูมิ' });
    expect(hospital).toHaveAttribute('href', '/hr/organizations/hosp');
    const hospitalItem = hospital.closest('li')!;
    expect(within(hospitalItem).getAllByText('โรงพยาบาล')[0]).toBeInTheDocument();
    expect(within(hospitalItem).getByText('ผู้อำนวยการ นพ.สมชาย ใจดี')).toBeInTheDocument();
    const nursingItem = screen.getByRole('link', { name: 'กลุ่มการพยาบาล' }).closest('li')!;
    expect(within(nursingItem).getByText('กลุ่มงาน')).toBeInTheDocument();
    expect(within(nursingItem).getByText('ยังไม่มีหัวหน้า')).toBeInTheDocument();
  });

  it('warns when the current head is no longer active', async () => {
    mocks.headers.mockResolvedValue(new Headers());
    mocks.readSession.mockResolvedValue({ authenticated: true, personId: 'reader', roles: [{ name: 'hr-reader', organizationId: null }], dataOwnerModules: [] });
    mocks.getSharedDatabase.mockReturnValue({ query: vi.fn() });
    mocks.listOrganizations.mockResolvedValue([{ id: 'hosp', code: 'HOSP', name: 'โรงพยาบาลวาริชภูมิ', parentId: null, activePeople: 1, unitType: 'HOSPITAL', headPersonId: 'p1', headDisplayName: 'นพ.สมชาย ใจดี', headActive: false }]);

    render(await OrganizationsPage());

    expect(screen.getByText('ผู้อำนวยการพ้นสภาพ')).toBeInTheDocument();
  });

  it('shows no data to a person without HR read permission', async () => {
    mocks.headers.mockResolvedValue(new Headers());
    mocks.readSession.mockResolvedValue({ authenticated: true, personId: 'staff', roles: [], dataOwnerModules: [] });

    render(await OrganizationsPage());

    expect(screen.getByRole('alert')).toHaveTextContent('คุณไม่มีสิทธิ์ดูข้อมูลส่วนนี้');
    expect(mocks.listOrganizations).not.toHaveBeenCalled();
  });

  it('lets an HR manager add a กลุ่มงาน, and a งาน under a chosen กลุ่มงาน', async () => {
    mocks.headers.mockResolvedValue(new Headers());
    mocks.readSession.mockResolvedValue({ authenticated: true, personId: 'manager', roles: [{ name: 'hr-manager', organizationId: null }], dataOwnerModules: ['hr'], hospitalWideDataOwnerModules: ['hr'] });
    mocks.getSharedDatabase.mockReturnValue({ query: vi.fn() });
    mocks.listOrganizations.mockResolvedValue([
      { id: 'hosp', code: 'HOSP', name: 'โรงพยาบาลวาริชภูมิ', parentId: null, activePeople: 1, unitType: 'HOSPITAL' },
      { id: 'nur', code: 'NUR', name: 'กลุ่มการพยาบาล', parentId: 'hosp', activePeople: 12, unitType: 'DIVISION' }
    ]);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, id: 'new' }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    render(await OrganizationsPage());

    const sectionForm = screen.getByRole('form', { name: 'เพิ่มงาน' });
    fireEvent.change(within(sectionForm).getByLabelText('ชื่องาน'), { target: { value: 'งานผู้ป่วยใน' } });
    fireEvent.change(within(sectionForm).getByLabelText('กลุ่มงาน'), { target: { value: 'nur' } });
    fireEvent.click(within(sectionForm).getByRole('button', { name: 'เพิ่มงาน' }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/hr/organizations');
    expect(JSON.parse(init.body as string)).toEqual({ name: 'งานผู้ป่วยใน', unitType: 'SECTION', parentId: 'nur' });

    const divisionForm = screen.getByRole('form', { name: 'เพิ่มกลุ่มงาน' });
    fireEvent.change(within(divisionForm).getByLabelText('ชื่อกลุ่มงาน'), { target: { value: 'กลุ่มงานเภสัชกรรม' } });
    fireEvent.click(within(divisionForm).getByRole('button', { name: 'เพิ่มกลุ่มงาน' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body as string)).toEqual({ name: 'กลุ่มงานเภสัชกรรม', unitType: 'DIVISION' });
  });

  it('gives an HR reader no add forms', async () => {
    mocks.headers.mockResolvedValue(new Headers());
    mocks.readSession.mockResolvedValue({ authenticated: true, personId: 'reader', roles: [{ name: 'hr-reader', organizationId: null }], dataOwnerModules: [] });
    mocks.getSharedDatabase.mockReturnValue({ query: vi.fn() });
    mocks.listOrganizations.mockResolvedValue([{ id: 'nur', code: null, name: 'กลุ่มการพยาบาล', parentId: null, activePeople: 1, unitType: 'DIVISION' }]);
    render(await OrganizationsPage());
    expect(screen.queryByRole('form', { name: 'เพิ่มงาน' })).toBeNull();
  });
});
