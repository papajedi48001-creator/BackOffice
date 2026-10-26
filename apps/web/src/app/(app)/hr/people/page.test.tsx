import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ headers: vi.fn(), redirect: vi.fn(), readSession: vi.fn(), getSharedDatabase: vi.fn(), listPeople: vi.fn() }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), HrDirectory: class { listPeople = mocks.listPeople; } }));

import PeoplePage from './page';

const person = { id: 'p1', employmentTypeName: 'ข้าราชการ', employeeCode: 'E001', displayName: 'นางสาวมาลี ดีงาม', positionTitle: 'พยาบาลวิชาชีพ', employmentStatus: 'ACTIVE', nationalIdMasked: 'X-XXXX-XXXXX-12-3', organizationName: 'กลุ่มการพยาบาล', organizationCode: 'NUR' };

afterEach(() => vi.clearAllMocks());

describe('PeoplePage', () => {
  it('lists people in the reader scope with only the masked national ID', async () => {
    mocks.headers.mockResolvedValue(new Headers());
    mocks.readSession.mockResolvedValue({ authenticated: true, personId: 'reader', roles: [{ name: 'hr-reader', organizationId: 'unit-nur' }], dataOwnerModules: [] });
    mocks.getSharedDatabase.mockReturnValue({ query: vi.fn() });
    mocks.listPeople.mockResolvedValue([person]);

    render(await PeoplePage());

    expect(mocks.listPeople).toHaveBeenCalledWith({ organizationIds: ['unit-nur'] });
    expect(screen.getByRole('cell', { name: 'นางสาวมาลี ดีงาม' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'X-XXXX-XXXXX-12-3' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'ปฏิบัติงาน' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'ข้าราชการ' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'นางสาวมาลี ดีงาม' })).toHaveAttribute('href', '/hr/people/p1');
  });

  it('shows no data to a person without HR read permission', async () => {
    mocks.headers.mockResolvedValue(new Headers());
    mocks.readSession.mockResolvedValue({ authenticated: true, personId: 'staff', roles: [], dataOwnerModules: [] });

    render(await PeoplePage());

    expect(screen.getByRole('alert')).toHaveTextContent('คุณไม่มีสิทธิ์ดูข้อมูลส่วนนี้');
    expect(mocks.listPeople).not.toHaveBeenCalled();
  });

  it('redirects a signed-out visitor', async () => {
    mocks.headers.mockResolvedValue(new Headers());
    mocks.readSession.mockResolvedValue(null);

    await PeoplePage();

    expect(mocks.redirect).toHaveBeenCalledWith('/');
  });
});
