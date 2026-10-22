import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ headers: vi.fn(), redirect: vi.fn(), notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND'); }), refresh: vi.fn(), readSession: vi.fn(), getSharedDatabase: vi.fn(), getOrganization: vi.fn(), listPeople: vi.fn() }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, notFound: mocks.notFound, useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock('../../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), HrDirectory: class { getOrganization = mocks.getOrganization; listPeople = mocks.listPeople; } }));

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
}
const page = (organizationId = 'nur') => OrganizationPage({ params: Promise.resolve({ organizationId }) });

afterEach(() => vi.clearAllMocks());

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
});
