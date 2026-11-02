import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ headers: vi.fn(), redirect: vi.fn(), readSession: vi.fn(), getSharedDatabase: vi.fn(), listPeople: vi.fn() }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), HrDirectory: class { listPeople = mocks.listPeople; } }));

import PeoplePage from './page';

const person = { id: 'p1', employmentTypeName: 'ข้าราชการ', employeeCode: 'E001', displayName: 'นางสาวมาลี ดีงาม', positionTitle: 'พยาบาลวิชาชีพ', employmentStatus: 'ACTIVE', nationalIdMasked: 'X-XXXX-XXXXX-12-3', organizationName: 'กลุ่มการพยาบาล', organizationCode: 'NUR' };
const noFilter = { searchParams: Promise.resolve({}) };

afterEach(() => vi.clearAllMocks());

describe('PeoplePage', () => {
  it('lists people in the reader scope with only the masked national ID', async () => {
    mocks.headers.mockResolvedValue(new Headers());
    mocks.readSession.mockResolvedValue({ authenticated: true, personId: 'reader', roles: [{ name: 'hr-reader', organizationId: 'unit-nur' }], dataOwnerModules: [] });
    mocks.getSharedDatabase.mockReturnValue({ query: vi.fn() });
    mocks.listPeople.mockResolvedValue([person]);

    render(await PeoplePage(noFilter));

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

    render(await PeoplePage(noFilter));

    expect(screen.getByRole('alert')).toHaveTextContent('คุณไม่มีสิทธิ์ดูข้อมูลส่วนนี้');
    expect(mocks.listPeople).not.toHaveBeenCalled();
  });

  it('redirects a signed-out visitor', async () => {
    mocks.headers.mockResolvedValue(new Headers());
    mocks.readSession.mockResolvedValue(null);

    await PeoplePage(noFilter);

    expect(mocks.redirect).toHaveBeenCalledWith('/');
  });

  it('offers เพิ่มบุคลากร only to a hospital-wide HR manager', async () => {
    mocks.headers.mockResolvedValue(new Headers());
    mocks.getSharedDatabase.mockReturnValue({ query: vi.fn() });
    mocks.listPeople.mockResolvedValue([person]);
    mocks.readSession.mockResolvedValue({ authenticated: true, personId: 'manager', roles: [{ name: 'hr-manager', organizationId: null }], dataOwnerModules: ['hr'], hospitalWideDataOwnerModules: ['hr'] });
    const { unmount } = render(await PeoplePage(noFilter));
    expect(screen.getByRole('link', { name: 'เพิ่มบุคลากร' })).toHaveAttribute('href', '/hr/people/new');
    unmount();
    mocks.readSession.mockResolvedValue({ authenticated: true, personId: 'reader', roles: [{ name: 'hr-reader', organizationId: null }], dataOwnerModules: [] });
    render(await PeoplePage(noFilter));
    expect(screen.queryByRole('link', { name: 'เพิ่มบุคลากร' })).toBeNull();
  });

  describe('search and filters', () => {
    const people = [
      person,
      { ...person, id: 'p2', employeeCode: 'PHA005', displayName: 'เภสัชกรหญิงศิริพร สมมุติ', positionTitle: 'เภสัชกร', employmentTypeName: 'พนักงานราชการ', organizationName: 'กลุ่มงานเภสัชกรรม' },
      { ...person, id: 'p3', employeeCode: 'NUR014', displayName: 'นางสาวสุดารัตน์ ใจสมมติ', positionTitle: 'พยาบาลวิชาชีพ', employmentTypeName: 'ข้าราชการ', organizationName: null },
    ];
    const show = async (params: Record<string, string>) => {
      mocks.headers.mockResolvedValue(new Headers());
      mocks.readSession.mockResolvedValue({ authenticated: true, personId: 'reader', roles: [{ name: 'hr-reader', organizationId: null }], dataOwnerModules: [] });
      mocks.getSharedDatabase.mockReturnValue({ query: vi.fn() });
      mocks.listPeople.mockResolvedValue(people);
      render(await PeoplePage({ searchParams: Promise.resolve(params) }));
    };
    const names = () => screen.queryAllByRole('link').filter((link) => /^\/hr\/people\/p\d$/.test(link.getAttribute('href') ?? '')).map((link) => link.textContent);

    it('offers a name search box and filters built from the listed people', async () => {
      await show({});
      const form = screen.getByRole('search');
      expect(within(form).getByRole('searchbox', { name: 'ค้นหารายชื่อ' })).toHaveAttribute('name', 'q');
      const position = within(form).getByRole('combobox', { name: 'ตำแหน่งงาน' });
      expect(position).toHaveAttribute('name', 'position');
      expect(within(position).getAllByRole('option').map((option) => option.textContent)).toEqual(['ทุกตำแหน่ง', 'พยาบาลวิชาชีพ', 'เภสัชกร']);
      const type = within(form).getByRole('combobox', { name: 'ประเภทการจ้าง' });
      expect(type).toHaveAttribute('name', 'employmentType');
      expect(within(type).getAllByRole('option').map((option) => option.textContent)).toEqual(['ทุกประเภทการจ้าง', 'ข้าราชการ', 'พนักงานราชการ']);
      const unit = within(form).getByRole('combobox', { name: 'หน่วยงาน' });
      expect(unit).toHaveAttribute('name', 'organization');
      expect(within(unit).getAllByRole('option').map((option) => option.textContent)).toEqual(['ทุกหน่วยงาน', 'กลุ่มการพยาบาล', 'กลุ่มงานเภสัชกรรม']);
      expect(names()).toHaveLength(3);
    });

    it('searches by part of the name or the employee code, ignoring case and outer spaces', async () => {
      await show({ q: '  ศิริ ' });
      expect(names()).toEqual(['เภสัชกรหญิงศิริพร สมมุติ']);
      cleanup();
      await show({ q: 'nur014' });
      expect(names()).toEqual(['นางสาวสุดารัตน์ ใจสมมติ']);
    });

    it('combines position, employment type and organization filters', async () => {
      await show({ position: 'พยาบาลวิชาชีพ', employmentType: 'ข้าราชการ', organization: 'กลุ่มการพยาบาล' });
      expect(names()).toEqual(['นางสาวมาลี ดีงาม']);
      expect(screen.getByRole('combobox', { name: 'ตำแหน่งงาน' })).toHaveValue('พยาบาลวิชาชีพ');
      expect(screen.getByRole('link', { name: 'ล้างตัวกรอง' })).toHaveAttribute('href', '/hr/people');
    });

    it('says so when nobody matches', async () => {
      await show({ q: 'ไม่มีชื่อนี้' });
      expect(screen.queryByRole('table')).toBeNull();
      expect(screen.getByText('ไม่พบบุคลากรที่ตรงกับเงื่อนไข')).toBeInTheDocument();
      expect(screen.getByRole('searchbox', { name: 'ค้นหารายชื่อ' })).toHaveValue('ไม่มีชื่อนี้');
    });
  });
});
