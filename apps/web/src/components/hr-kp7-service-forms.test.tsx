import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

import { CivilServiceForm, EducationForm } from './hr-kp7-service-forms';

const blank = { positionNumber: null, salary: null, parentAgency: null, gpfStatus: null, firstAppointedOn: null, reappointedOn: null, transferredInOn: null, transferredOutOn: null, joinedUnitOn: null, currentLevelSince: null, qualification: null, qualificationMajor: null, specialAllowance: null };
const body = (fetchMock: ReturnType<typeof vi.fn>) => JSON.parse(((fetchMock.mock.calls.at(-1) as unknown as [string, RequestInit])[1].body) as string) as Record<string, unknown>;
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('CivilServiceForm', () => {
  it('sends the salary as a number, กบข as a code and blanks as null', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true}'));
    vi.stubGlobal('fetch', fetchMock);
    render(<CivilServiceForm endpoint="/api/hr/people/p1/civil-service" values={{ ...blank, positionNumber: '900001' }} />);
    fireEvent.change(screen.getByLabelText('เงินเดือน (บาท)'), { target: { value: '25000.50' } });
    fireEvent.change(screen.getByLabelText('กบข.'), { target: { value: 'MEMBER' } });
    fireEvent.change(screen.getByLabelText('วันที่บรรจุครั้งแรก'), { target: { value: '2020-08-24' } });
    fireEvent.change(screen.getByLabelText('ตำแหน่งเลขที่'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกข้อมูลการปฏิบัติราชการ' }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect(body(fetchMock)).toEqual({ ...blank, salary: 25000.5, gpfStatus: 'MEMBER', firstAppointedOn: '2020-08-24', positionNumber: null });
  });
});

describe('EducationForm', () => {
  it('adds, removes and sends rows in order, skipping a row with no วุฒิ', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true}'));
    vi.stubGlobal('fetch', fetchMock);
    render(<EducationForm endpoint="/api/hr/people/p1/education" entries={[{ graduatedOn: '2009-03-07', degree: 'ปริญญาตรี', major: null, institution: null, country: null }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'เพิ่มวุฒิการศึกษา' }));
    fireEvent.change(screen.getAllByLabelText('วุฒิการศึกษา')[1]!, { target: { value: 'ปริญญาโท' } });
    fireEvent.change(screen.getAllByLabelText('สถาบัน')[1]!, { target: { value: 'มหาวิทยาลัยทดสอบ' } });
    fireEvent.click(screen.getByRole('button', { name: 'เพิ่มวุฒิการศึกษา' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'ลบแถวนี้' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกข้อมูลการศึกษา' }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect(body(fetchMock)).toEqual({ entries: [{ graduatedOn: null, degree: 'ปริญญาโท', major: null, institution: 'มหาวิทยาลัยทดสอบ', country: null }] });
  });
});

describe('HrProfileView ก.พ.7 service and education boxes', async () => {
  const { HrProfileView } = await import('./hr-profile-view');
  const work = { personId: 'p1', employeeCode: 'E1', displayName: 'ผู้ทดสอบ', employmentStatus: 'ACTIVE', organizationId: null, organizationName: null, positionTitle: null, positionLevel: null, employmentTypeId: null, employmentTypeName: null, appointedOn: null, photoAttachmentId: null };
  const personal = { namePrefix: null, firstName: null, lastName: null, gender: null, birthDate: '1986-03-10', phone: null, address: null, emergencyContactName: null, emergencyContactRelationship: null, emergencyContactPhone: null, maritalStatus: null, religion: null, birthplace: null, fatherName: null, motherName: null, motherMaidenName: null, spouseName: null, spouseMaidenName: null, childrenCount: null, kp7File: null,
    civilService: { ...blank, salary: 25000.5, gpfStatus: 'MEMBER' as const, retirementDate: '2046-10-01' }, education: [{ graduatedOn: '2009-03-07', degree: 'ปริญญาตรี', major: 'คอมพิวเตอร์', institution: 'มหาวิทยาลัยทดสอบ', country: null }] };
  const view = (editProfile: boolean) => ({ work, private: personal, access: { viewWork: true, viewPrivate: true, editProfile, editContact: true }, history: [] });

  it('shows the person their ก.พ.7 service details read-only, and the education form', () => {
    render(<HrProfileView view={view(false)} contactEndpoint="/x" />);
    expect(screen.getByRole('region', { name: 'ข้อมูลการปฏิบัติราชการ (ก.พ.7)' })).toHaveTextContent('25,000.50');
    expect(screen.getByRole('region', { name: 'ข้อมูลการปฏิบัติราชการ (ก.พ.7)' })).toHaveTextContent('สมัคร');
    expect(screen.getByRole('region', { name: 'ข้อมูลการศึกษา (ก.พ.7)' })).toHaveTextContent('มหาวิทยาลัยทดสอบ');
    expect(screen.queryByRole('form', { name: 'แก้ไขข้อมูลการปฏิบัติราชการ' })).toBeNull();
    expect(screen.getByRole('form', { name: 'แก้ไขข้อมูลการศึกษา' })).toBeInTheDocument();
  });

  it('gives HR the civil-service form', () => {
    render(<HrProfileView view={view(true)} contactEndpoint="/x" />);
    expect(screen.getByRole('form', { name: 'แก้ไขข้อมูลการปฏิบัติราชการ' })).toBeInTheDocument();
  });
});
