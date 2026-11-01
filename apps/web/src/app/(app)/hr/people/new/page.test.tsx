import { render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ headers: vi.fn(), redirect: vi.fn(), readSession: vi.fn(), getSharedDatabase: vi.fn(), listTypes: vi.fn(), listOrganizations: vi.fn(), listPositions: vi.fn() }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('../../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({
  ...await importOriginal<typeof import('@backoffice/core')>(),
  EmploymentTypeService: class { list = mocks.listTypes; },
  HrDirectory: class { listOrganizations = mocks.listOrganizations; },
  PositionCatalogService: class { list = mocks.listPositions; }
}));

import NewPersonPage from './page';

const manager = { authenticated: true, personId: 'manager', roles: [{ name: 'hr-manager', organizationId: null }], dataOwnerModules: ['hr'], hospitalWideDataOwnerModules: ['hr'] };
afterEach(() => vi.clearAllMocks());

it('gives a hospital-wide HR manager the new บุคลากร form with only open positions and active types', async () => {
  mocks.headers.mockResolvedValue(new Headers());
  mocks.readSession.mockResolvedValue(manager);
  mocks.getSharedDatabase.mockReturnValue({ query: vi.fn() });
  mocks.listTypes.mockResolvedValue([{ id: 't1', name: 'ข้าราชการ', isActive: true }, { id: 't2', name: 'เลิกใช้', isActive: false }]);
  mocks.listOrganizations.mockResolvedValue([{ id: 'nur', name: 'กลุ่มการพยาบาล', unitType: 'DIVISION', parentId: 'h' }]);
  mocks.listPositions.mockResolvedValue([{ name: 'เจ้าพนักงานธุรการ', allowedLevels: ['ปฏิบัติงาน'], isActive: true }, { name: 'ปิดแล้ว', allowedLevels: [], isActive: false }]);
  render(await NewPersonPage());
  expect(screen.getByRole('heading', { name: 'เพิ่มบุคลากรใหม่' })).toBeInTheDocument();
  expect(screen.getByRole('form', { name: 'เพิ่มบุคลากรใหม่' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'ข้าราชการ' })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'เลิกใช้' })).toBeNull();
  expect(Array.from(document.querySelectorAll('datalist#new-person-positions option')).map((option) => option.getAttribute('value'))).toEqual(['เจ้าพนักงานธุรการ']);
});

it('refuses anyone else', async () => {
  mocks.headers.mockResolvedValue(new Headers());
  mocks.readSession.mockResolvedValue({ authenticated: true, personId: 'reader', roles: [{ name: 'hr-reader', organizationId: null }], dataOwnerModules: [] });
  mocks.getSharedDatabase.mockReturnValue({ query: vi.fn() });
  render(await NewPersonPage());
  expect(screen.getByRole('alert')).toHaveTextContent('คุณไม่มีสิทธิ์ดูข้อมูลส่วนนี้');
  expect(screen.queryByRole('form')).toBeNull();
});
