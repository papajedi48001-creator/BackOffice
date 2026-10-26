import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ headers: vi.fn(), redirect: vi.fn(), readSession: vi.fn(), getSharedDatabase: vi.fn(), listOrganizations: vi.fn() }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), HrDirectory: class { listOrganizations = mocks.listOrganizations; } }));

import OrganizationsPage from './page';

afterEach(() => vi.clearAllMocks());

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
});
