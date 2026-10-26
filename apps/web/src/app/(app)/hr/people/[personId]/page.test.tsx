import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ headers: vi.fn(), redirect: vi.fn(), notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND'); }), refresh: vi.fn(), readSession: vi.fn(), getSharedDatabase: vi.fn(), get: vi.fn(), listTypes: vi.fn(), listOrganizations: vi.fn() }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, notFound: mocks.notFound, useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock('../../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({
  ...await importOriginal<typeof import('@backoffice/core')>(),
  HrProfileService: class { get = mocks.get; },
  EmploymentTypeService: class { list = mocks.listTypes; },
  HrDirectory: class { listOrganizations = mocks.listOrganizations; }
}));

import PersonProfilePage from './page';

const manager = { authenticated: true, personId: 'manager', roles: [{ name: 'hr-manager', organizationId: null }], dataOwnerModules: ['hr'], hospitalWideDataOwnerModules: ['hr'] };
const reader = { authenticated: true, personId: 'reader', roles: [{ name: 'hr-reader', organizationId: null }], dataOwnerModules: [] };
const work = { personId: 'p1', employeeCode: 'E001', displayName: 'นางสาวมาลี ดีงาม', employmentStatus: 'ACTIVE', organizationId: 'nur', organizationName: 'กลุ่มการพยาบาล', positionTitle: 'พยาบาลวิชาชีพ', positionLevel: 'ชำนาญการ', employmentTypeId: 't1', employmentTypeName: 'ข้าราชการ', appointedOn: '2015-04-01' };
const personal = { namePrefix: 'นางสาว', firstName: 'มาลี', lastName: 'ดีงาม', gender: 'FEMALE', birthDate: '1990-05-17', phone: '0812345678', address: 'วาริชภูมิ', emergencyContactName: 'แม่', emergencyContactRelationship: 'มารดา', emergencyContactPhone: '0899999999' };
const history = [{ at: '2026-10-25T03:00:00Z', actorDisplayName: 'ผู้ดูแล HR', action: 'hr.person.profile.update', changedFields: ['positionLevel', 'phone'], workChanges: { positionLevel: { from: 'ปฏิบัติการ', to: 'ชำนาญการ' } } }];

function ready(session: unknown, view: unknown) {
  mocks.headers.mockResolvedValue(new Headers());
  mocks.readSession.mockResolvedValue(session);
  mocks.getSharedDatabase.mockReturnValue({ query: vi.fn() });
  mocks.get.mockResolvedValue(view);
  mocks.listTypes.mockResolvedValue([{ id: 't1', code: 'CIVIL_SERVANT', name: 'ข้าราชการ', isActive: true, sortOrder: 1 }]);
  mocks.listOrganizations.mockResolvedValue([{ id: 'nur', name: 'กลุ่มการพยาบาล' }, { id: 'pha', name: 'งานเภสัชกรรม' }]);
}
const page = (personId = 'p1') => PersonProfilePage({ params: Promise.resolve({ personId }) });

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('PersonProfilePage', () => {
  it('shows a reader the work box and history in Thai dates, without private boxes or forms', async () => {
    ready(reader, { work, private: null, access: { viewWork: true, viewPrivate: false, editProfile: false, editContact: false }, history });

    render(await page());

    expect(mocks.get).toHaveBeenCalledWith('p1', reader);
    expect(screen.getByRole('heading', { name: 'นางสาวมาลี ดีงาม' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'ข้อมูลงาน' })).toBeInTheDocument();
    expect(screen.getByText('1 เม.ย. 2558')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'ข้อมูลส่วนตัว' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'ข้อมูลติดต่อ' })).toBeNull();
    expect(screen.queryByRole('form')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    const row = screen.getByRole('row', { name: /ผู้ดูแล HR/ });
    expect(within(row).getByText(/ระดับตำแหน่ง: ปฏิบัติการ → ชำนาญการ/)).toBeInTheDocument();
    expect(within(row).getByText(/เบอร์โทร/)).toBeInTheDocument();
    expect(within(row).getByText(/25 ต.ค. 2569 10:00/)).toBeInTheDocument();
  });

  it('shows an hr manager every box with the profile and contact forms', async () => {
    ready(manager, { work, private: personal, access: { viewWork: true, viewPrivate: true, editProfile: true, editContact: true }, history: [] });

    render(await page());

    expect(screen.getByRole('heading', { name: 'ข้อมูลส่วนตัว' })).toBeInTheDocument();
    expect(screen.getByText('17 พ.ค. 2533')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'ข้อมูลติดต่อ' })).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'แก้ไขข้อมูลส่วนตัวและข้อมูลงาน' })).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'แก้ไขข้อมูลติดต่อ' })).toBeInTheDocument();
    expect(screen.getByText('ยังไม่มีการเปลี่ยนแปลง')).toBeInTheDocument();
  });

  it('fills gender from a known prefix and sends the profile to the person endpoint', async () => {
    ready(manager, { work, private: { ...personal, gender: null, namePrefix: null }, access: { viewWork: true, viewPrivate: true, editProfile: true, editContact: true }, history: [] });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(await page());

    const form = screen.getByRole('form', { name: 'แก้ไขข้อมูลส่วนตัวและข้อมูลงาน' });
    fireEvent.change(within(form).getByLabelText('คำนำหน้า'), { target: { value: 'นาย' } });
    expect(within(form).getByLabelText('เพศ')).toHaveValue('MALE');
    fireEvent.click(within(form).getByRole('button', { name: 'บันทึกข้อมูล' }));

    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe('/api/hr/people/p1/profile');
    expect(JSON.parse(init.body as string)).toMatchObject({ namePrefix: 'นาย', gender: 'MALE', employmentTypeId: 't1', organizationId: 'nur', birthDate: '1990-05-17' });
  });

  it('shows a Thai message when a save is refused', async () => {
    ready(manager, { work, private: personal, access: { viewWork: true, viewPrivate: true, editProfile: true, editContact: true }, history: [] });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'GENDER_REQUIRED' }), { status: 400 })));
    render(await page());

    fireEvent.click(within(screen.getByRole('form', { name: 'แก้ไขข้อมูลส่วนตัวและข้อมูลงาน' })).getByRole('button', { name: 'บันทึกข้อมูล' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('คำนำหน้านี้บอกเพศไม่ได้ กรุณาระบุเพศ');
  });

  it('reports no access and an unknown person', async () => {
    ready(reader, 'FORBIDDEN');
    render(await page());
    expect(screen.getByRole('alert')).toHaveTextContent('คุณไม่มีสิทธิ์ดูข้อมูลส่วนนี้');

    ready(reader, 'NOT_FOUND');
    await expect(page('missing')).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
