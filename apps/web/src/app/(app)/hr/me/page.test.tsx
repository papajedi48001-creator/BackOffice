import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ headers: vi.fn(), redirect: vi.fn(), notFound: vi.fn(), refresh: vi.fn(), readSession: vi.fn(), getSharedDatabase: vi.fn(), get: vi.fn(), enabled: vi.fn(() => false) }));
vi.mock('../../../../lib/attachments', () => ({ attachmentsEnabled: mocks.enabled }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, notFound: mocks.notFound, useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock('../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), HrProfileService: class { get = mocks.get; } }));

import MyProfilePage from './page';

const staff = { authenticated: true, personId: 'me', roles: [], dataOwnerModules: [] };
const work = { personId: 'me', employeeCode: 'E010', displayName: 'นายสมชาย ใจดี', employmentStatus: 'ACTIVE', organizationId: 'pha', organizationName: 'งานเภสัชกรรม', positionTitle: 'เภสัชกร', positionLevel: null, employmentTypeId: null, employmentTypeName: null, appointedOn: null, photoAttachmentId: null };
const personal = { namePrefix: 'นาย', firstName: 'สมชาย', lastName: 'ใจดี', gender: 'MALE', birthDate: null, phone: null, address: null, emergencyContactName: null, emergencyContactRelationship: null, emergencyContactPhone: null };

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('MyProfilePage', () => {
  it('shows a person without HR roles their own private details and only the contact form', async () => {
    mocks.headers.mockResolvedValue(new Headers());
    mocks.readSession.mockResolvedValue(staff);
    mocks.getSharedDatabase.mockReturnValue({ query: vi.fn() });
    mocks.get.mockResolvedValue({ work, private: personal, access: { viewWork: true, viewPrivate: true, editProfile: false, editContact: true }, history: [] });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    render(await MyProfilePage());

    expect(mocks.get).toHaveBeenCalledWith('me', staff);
    expect(screen.getByRole('heading', { name: 'ประวัติของฉัน' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'ข้อมูลส่วนตัว' })).toBeInTheDocument();
    expect(screen.getByText('ชาย', { selector: 'dd' })).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'แก้ไขข้อมูลส่วนตัวและข้อมูลงาน' })).toBeNull();
    const form = screen.getByRole('form', { name: 'แก้ไขข้อมูลติดต่อ' });
    fireEvent.change(within(form).getByLabelText('เบอร์โทร'), { target: { value: '0812345678' } });
    fireEvent.click(within(form).getByRole('button', { name: 'บันทึกข้อมูลติดต่อ' }));

    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe('/api/hr/me/contact');
    expect(JSON.parse(init.body as string)).toEqual({ phone: '0812345678', address: null, emergencyContactName: null, emergencyContactRelationship: null, emergencyContactPhone: null });
  });

  it('lets the person edit their own personal details but not their work details', async () => {
    mocks.headers.mockResolvedValue(new Headers());
    mocks.readSession.mockResolvedValue(staff);
    mocks.getSharedDatabase.mockReturnValue({ query: vi.fn() });
    mocks.get.mockResolvedValue({ work, private: personal, access: { viewWork: true, viewPrivate: true, editProfile: false, editContact: true }, history: [] });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    render(await MyProfilePage());

    const form = screen.getByRole('form', { name: 'แก้ไขข้อมูลส่วนตัว' });
    expect(within(form).queryByLabelText('ตำแหน่งงาน')).toBeNull();
    fireEvent.change(within(form).getByLabelText('ชื่อ'), { target: { value: 'สมหมาย' } });
    fireEvent.change(within(form).getByLabelText('วันเกิด'), { target: { value: '1990-01-02' } });
    fireEvent.click(within(form).getByRole('button', { name: 'บันทึกข้อมูลส่วนตัว' }));

    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe('/api/hr/me/personal');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({ namePrefix: 'นาย', firstName: 'สมหมาย', lastName: 'ใจดี', gender: 'MALE', birthDate: '1990-01-02' });
  });

  it('says photo upload is unavailable without object storage, and uploads a photo when it is set up', async () => {
    mocks.headers.mockResolvedValue(new Headers());
    mocks.readSession.mockResolvedValue(staff);
    mocks.getSharedDatabase.mockReturnValue({ query: vi.fn() });
    mocks.get.mockResolvedValue({ work, private: personal, access: { viewWork: true, viewPrivate: true, editProfile: false, editContact: true }, history: [] });
    const { unmount } = render(await MyProfilePage());
    expect(screen.getByText('ยังอัปโหลดรูปไม่ได้ เพราะระบบยังไม่ได้ตั้งค่าที่เก็บไฟล์')).toBeInTheDocument();
    expect(screen.queryByLabelText('เลือกรูป')).toBeNull();
    unmount();

    mocks.enabled.mockReturnValue(true);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ photoUrl: '/api/hr/people/me/photo?v=a-1' }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    render(await MyProfilePage());
    const file = new File([new Uint8Array([0x89, 0x50])], 'me.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('เลือกรูป'), { target: { files: [file] } });
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe('/api/hr/me/photo');
    expect(init.method).toBe('POST');
    expect((init.body as FormData).get('file')).toBe(file);
    expect(screen.getByText('บันทึกรูปประจำตัวแล้ว')).toBeInTheDocument();
  });

  it('redirects a signed-out visitor', async () => {
    mocks.headers.mockResolvedValue(new Headers());
    mocks.readSession.mockResolvedValue(null);
    await MyProfilePage();
    expect(mocks.redirect).toHaveBeenCalledWith('/');
  });
});
