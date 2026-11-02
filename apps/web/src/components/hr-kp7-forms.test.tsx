import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProfileView } from '@backoffice/core';

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

import { FamilyForm, Kp7FileForm } from './hr-kp7-forms';
import { HrProfileView } from './hr-profile-view';

const empty = { maritalStatus: null, religion: null, birthplace: null, fatherName: null, motherName: null, motherMaidenName: null, spouseName: null, spouseMaidenName: null, childrenCount: null };
const lastBody = (fetchMock: ReturnType<typeof vi.fn>) => JSON.parse(((fetchMock.mock.calls.at(-1) as unknown as [string, RequestInit])[1].body) as string) as Record<string, unknown>;
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('FamilyForm', () => {
  it('sends the ก.พ.7 family fields, null for blanks and a number for จำนวนบุตร', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<FamilyForm endpoint="/api/hr/people/p1/family" values={{ ...empty, religion: 'พุทธ' }} />);
    fireEvent.change(screen.getByLabelText('สถานภาพ'), { target: { value: 'MARRIED' } });
    fireEvent.change(screen.getByLabelText('ชื่อบิดา'), { target: { value: 'นายทดสอบ ตัวอย่าง' } });
    fireEvent.change(screen.getByLabelText('ศาสนา'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('จำนวนบุตร'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกข้อมูลครอบครัว' }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[0]).toBe('/api/hr/people/p1/family');
    expect(lastBody(fetchMock)).toEqual({ ...empty, maritalStatus: 'MARRIED', fatherName: 'นายทดสอบ ตัวอย่าง', religion: null, childrenCount: 2 });
  });
});

describe('Kp7FileForm', () => {
  it('uploads a PDF and refuses another file type without sending it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"attachmentId":"f1"}', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<Kp7FileForm endpoint="/api/hr/people/p1/kp7" file={null} uploadsEnabled />);
    const input = screen.getByLabelText('เลือกไฟล์ ก.พ.7 (PDF)');
    fireEvent.change(input, { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('PDF');
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { files: [new File(['%PDF'], 'kp7.pdf', { type: 'application/pdf' })] } });
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect([url, init.method]).toEqual(['/api/hr/people/p1/kp7', 'POST']);
  });

  it('opens and removes the current file', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<Kp7FileForm endpoint="/api/hr/people/p1/kp7" file={{ attachmentId: 'f1', uploadedAt: '2026-11-01T03:00:00Z' }} uploadsEnabled />);
    expect(screen.getByRole('link', { name: 'เปิดไฟล์ ก.พ.7' })).toHaveAttribute('href', '/api/attachments/f1/download');
    fireEvent.click(screen.getByRole('button', { name: 'ลบไฟล์ ก.พ.7' }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].method).toBe('DELETE');
  });

  it('says uploads are unavailable without storage', () => {
    render(<Kp7FileForm endpoint="/api/hr/people/p1/kp7" file={null} uploadsEnabled={false} />);
    expect(screen.queryByLabelText('เลือกไฟล์ ก.พ.7 (PDF)')).toBeNull();
    expect(screen.getByText('ยังอัปโหลดไฟล์ไม่ได้ ระบบเก็บไฟล์ยังไม่พร้อม')).toBeInTheDocument();
  });
});

describe('HrProfileView ก.พ.7 boxes', () => {
  const work = { personId: 'p1', employeeCode: 'E1', displayName: 'ผู้ทดสอบ', employmentStatus: 'ACTIVE', organizationId: null, organizationName: null, positionTitle: null, positionLevel: null, employmentTypeId: null, employmentTypeName: null, appointedOn: null, photoAttachmentId: null };
  const personal = { namePrefix: null, firstName: null, lastName: null, gender: null, birthDate: null, phone: null, address: null, emergencyContactName: null, emergencyContactRelationship: null, emergencyContactPhone: null, ...empty, maritalStatus: 'SINGLE' as const, childrenCount: 0, kp7File: { attachmentId: 'f1', uploadedAt: '2026-11-01T03:00:00Z' }, civilService: { positionNumber: null, salary: null, parentAgency: null, gpfStatus: null, firstAppointedOn: null, reappointedOn: null, transferredInOn: null, transferredOutOn: null, joinedUnitOn: null, currentLevelSince: null, qualification: null, qualificationMajor: null, specialAllowance: null, retirementDate: null }, education: [], positionHistory: [] };
  const view = (editContact: boolean): ProfileView => ({ work, private: personal, access: { viewWork: true, viewPrivate: true, editProfile: false, editContact }, history: [{ at: '2026-11-01T03:00:00Z', actorDisplayName: 'ผู้ทดสอบ', action: 'hr.person.family.update', changedFields: ['maritalStatus', 'kp7File'], workChanges: {} }] });

  it('shows the family box and the file, and the forms only to someone who may edit', () => {
    const { unmount } = render(<HrProfileView view={view(true)} contactEndpoint="/x" uploadsEnabled />);
    const box = screen.getByRole('region', { name: 'ข้อมูลส่วนตัวและครอบครัว (ก.พ.7)' });
    expect(within(box).getByText('โสด')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'แก้ไขข้อมูล ข้อมูลส่วนตัวและครอบครัว (ก.พ.7)' }));
    expect(within(screen.getByRole('dialog')).getByRole('form', { name: 'แก้ไขข้อมูลครอบครัว' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ปิด' }));
    expect(screen.getByRole('link', { name: 'เปิดไฟล์ ก.พ.7' })).toBeInTheDocument();
    expect(screen.getByText('สถานภาพ', { selector: 'li' })).toBeInTheDocument();
    expect(screen.getByText('ไฟล์ ก.พ.7', { selector: 'li' })).toBeInTheDocument();
    unmount();
    render(<HrProfileView view={view(false)} contactEndpoint="/x" uploadsEnabled />);
    expect(screen.queryByRole('button', { name: 'แก้ไขข้อมูล ข้อมูลส่วนตัวและครอบครัว (ก.พ.7)' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'ลบไฟล์ ก.พ.7' })).toBeNull();
    expect(screen.getByRole('link', { name: 'เปิดไฟล์ ก.พ.7' })).toBeInTheDocument();
  });
});
