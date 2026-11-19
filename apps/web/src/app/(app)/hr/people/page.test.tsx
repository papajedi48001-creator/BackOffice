import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ push: vi.fn(), editor: vi.fn(), headers: vi.fn(), redirect: vi.fn(), readSession: vi.fn(), getSharedDatabase: vi.fn(), listPeople: vi.fn() }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, useRouter: () => ({ push: mocks.push, refresh: vi.fn() }) }));
vi.mock('./[personId]/person-editor', () => ({ PersonEditor: mocks.editor }));
vi.mock('../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), HrDirectory: class { listPeople = mocks.listPeople; } }));

import { fireEvent, within } from '@testing-library/react';
import PeoplePage from './page';

const person = { id: 'p1', employmentTypeName: 'ข้าราชการ', employeeCode: 'E001', displayName: 'นางสาวมาลี ดีงาม', positionTitle: 'พยาบาลวิชาชีพ', employmentStatus: 'ACTIVE', nationalIdMasked: 'X-XXXX-XXXXX-12-3', organizationName: 'กลุ่มการพยาบาล', organizationCode: 'NUR', providerLinked: false, thaidLinked: false };

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
    expect(screen.getByRole('link', { name: 'แก้ไข นางสาวมาลี ดีงาม' })).toHaveAttribute('href', '/hr/people?edit=p1');
    expect(screen.queryByRole('dialog')).toBeNull();
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

  it('offers เพิ่มบุคลากร only to a hospital-wide HR manager', async () => {
    mocks.headers.mockResolvedValue(new Headers());
    mocks.getSharedDatabase.mockReturnValue({ query: vi.fn() });
    mocks.listPeople.mockResolvedValue([person]);
    mocks.readSession.mockResolvedValue({ authenticated: true, personId: 'manager', roles: [{ name: 'hr-manager', organizationId: null }], dataOwnerModules: ['hr'], hospitalWideDataOwnerModules: ['hr'] });
    const { unmount } = render(await PeoplePage());
    expect(screen.getByRole('link', { name: 'เพิ่มบุคลากร' })).toHaveAttribute('href', '/hr/people/new');
    unmount();
    mocks.readSession.mockResolvedValue({ authenticated: true, personId: 'reader', roles: [{ name: 'hr-reader', organizationId: null }], dataOwnerModules: [] });
    render(await PeoplePage());
    expect(screen.queryByRole('link', { name: 'เพิ่มบุคลากร' })).toBeNull();
  });

  it('offers ส่งออกข้อมูล only to a hospital-wide HR exporter', async () => {
    mocks.headers.mockResolvedValue(new Headers());
    mocks.getSharedDatabase.mockReturnValue({ query: vi.fn() });
    mocks.listPeople.mockResolvedValue([person]);
    mocks.readSession.mockResolvedValue({ authenticated: true, personId: 'manager', roles: [{ name: 'hr-manager', organizationId: null }], dataOwnerModules: ['hr'], hospitalWideDataOwnerModules: ['hr'] });
    const { unmount } = render(await PeoplePage());
    expect(screen.getByRole('button', { name: 'ส่งออกข้อมูล' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: 'ทะเบียนบุคลากร' })).toHaveLength(1);
    unmount();
    mocks.readSession.mockResolvedValue({ authenticated: true, personId: 'reader', roles: [{ name: 'hr-reader', organizationId: null }], dataOwnerModules: [] });
    render(await PeoplePage());
    expect(screen.queryByRole('button', { name: 'ส่งออกข้อมูล' })).toBeNull();
  });

  it('opens the person editor in a popup over the list from the pencil, and closes only from its button', async () => {
    mocks.headers.mockResolvedValue(new Headers());
    mocks.readSession.mockResolvedValue({ authenticated: true, personId: 'manager', roles: [{ name: 'hr-manager', organizationId: null }], dataOwnerModules: ['hr'], hospitalWideDataOwnerModules: ['hr'] });
    mocks.getSharedDatabase.mockReturnValue({ query: vi.fn() });
    mocks.listPeople.mockResolvedValue([person]);
    mocks.editor.mockResolvedValue({ title: 'นางสาวมาลี ดีงาม', body: <p>ฟอร์มแก้ไขทั้งหมด</p> });
    render(await PeoplePage({ searchParams: Promise.resolve({ edit: 'p1' }) }));
    expect(mocks.editor).toHaveBeenCalledWith(expect.objectContaining({ personId: 'p1', inDialog: true }));
    const dialog = screen.getByRole('dialog', { name: 'แก้ไขข้อมูลบุคลากร นางสาวมาลี ดีงาม' });
    expect(within(dialog).getByText('ฟอร์มแก้ไขทั้งหมด')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'X-XXXX-XXXXX-12-3' })).toBeInTheDocument();
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'ปิด' }).at(-1)!);
    expect(mocks.push).toHaveBeenCalledWith('/hr/people', { scroll: false });
  });
});
