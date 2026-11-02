import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }) }));

import { AccountForm, IdentityForm, NewPersonForm } from './hr-account-forms';

const units = [
  { id: 'nur', name: 'กลุ่มการพยาบาล', unitType: 'DIVISION', parentId: 'hosp' },
  { id: 'ipd', name: 'งานผู้ป่วยใน', unitType: 'SECTION', parentId: 'nur' }
];
const positions = [{ name: 'เจ้าพนักงานธุรการ', allowedLevels: ['ปฏิบัติงาน', 'ชำนาญงาน'] }];
const respond = (status: number, body: unknown) => vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
const lastCall = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls.at(-1) as unknown as [string, RequestInit];
const type = (name: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(name), { target: { value } });

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('NewPersonForm', () => {
  function fillRequired() {
    type('เลขประจำตัวประชาชน', '1101700230708');
    type('ชื่อ', 'สมใจ');
    type('นามสกุล', 'ใจดี');
    type(/ชื่อผู้ใช้/, 'somjai');
    type('รหัสผ่าน', 'long-enough-1');
    type('ยืนยันรหัสผ่าน', 'long-enough-1');
  }

  it('creates the person with กลุ่มงาน, งาน and position, then opens their page', async () => {
    const fetchMock = respond(201, { ok: true, id: 'person-new' });
    vi.stubGlobal('fetch', fetchMock);
    render(<NewPersonForm employmentTypes={[]} units={units} positions={positions} />);
    fillRequired();
    type('กลุ่มงาน', 'กลุ่มการพยาบาล');
    type('งาน', 'งานผู้ป่วยใน');
    type('ตำแหน่งงาน', 'เจ้าพนักงานธุรการ');
    type('ระดับตำแหน่ง', 'ปฏิบัติงาน');
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกบุคลากรใหม่' }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/hr/people/person-new'));
    const [url, init] = lastCall(fetchMock);
    expect(url).toBe('/api/hr/people');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toMatchObject({ nationalId: '1101700230708', firstName: 'สมใจ', lastName: 'ใจดี', username: 'somjai', password: 'long-enough-1', organizationId: 'ipd', positionTitle: 'เจ้าพนักงานธุรการ', positionLevel: 'ปฏิบัติงาน' });
  });

  it('refuses a level the position does not have before sending', async () => {
    const fetchMock = respond(201, { ok: true, id: 'x' });
    vi.stubGlobal('fetch', fetchMock);
    render(<NewPersonForm employmentTypes={[]} units={units} positions={positions} />);
    fillRequired();
    type('ตำแหน่งงาน', 'เจ้าพนักงานธุรการ');
    type('ระดับตำแหน่ง', 'ปฏิบัติการ');
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกบุคลากรใหม่' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('ระดับนี้ใช้กับตำแหน่งนี้ไม่ได้');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not send when the two passwords differ', async () => {
    const fetchMock = respond(201, { ok: true, id: 'person-new' });
    vi.stubGlobal('fetch', fetchMock);
    render(<NewPersonForm employmentTypes={[]} units={units} positions={positions} />);
    fillRequired();
    type('ยืนยันรหัสผ่าน', 'long-enough-2');
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกบุคลากรใหม่' }));
    expect(await screen.findAllByRole('alert')).not.toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says when the username is already taken', async () => {
    vi.stubGlobal('fetch', respond(409, { error: 'DUPLICATE_USERNAME' }));
    render(<NewPersonForm employmentTypes={[]} units={units} positions={positions} />);
    fillRequired();
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกบุคลากรใหม่' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('ชื่อผู้ใช้นี้มีผู้ใช้แล้ว');
    expect(mocks.push).not.toHaveBeenCalled();
  });
});

describe('IdentityForm', () => {
  it('shows the username as fixed and sends only identity fields, leaving a blank national ID unchanged', async () => {
    const fetchMock = respond(200, { ok: true });
    vi.stubGlobal('fetch', fetchMock);
    render(<IdentityForm personId="p1" values={{ employeeCode: 'E1', employmentStatus: 'ACTIVE' }} username="somjai" />);
    expect(screen.getByLabelText(/ชื่อผู้ใช้/)).toHaveValue('somjai');
    expect(screen.getByLabelText(/ชื่อผู้ใช้/)).toHaveAttribute('readonly');
    type('รหัสบุคลากร', 'E9');
    fireEvent.change(screen.getByLabelText('สถานะ'), { target: { value: 'INACTIVE' } });
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกข้อมูลระบุตัวตน' }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    const [url, init] = lastCall(fetchMock);
    expect(url).toBe('/api/hr/people/p1/identity');
    expect(JSON.parse(init.body as string)).toEqual({ employeeCode: 'E9', employmentStatus: 'INACTIVE' });
  });
});

describe('AccountForm', () => {
  it('resets the password to the default after a confirmation, sending no password', async () => {
    const fetchMock = respond(200, { ok: true });
    vi.stubGlobal('fetch', fetchMock);
    render(<AccountForm personId="p1" username="somjai" />);
    expect(screen.queryByLabelText('รหัสผ่านใหม่')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'รีเซ็ตรหัสผ่าน' }));
    const dialog = screen.getByRole('dialog', { name: 'รีเซ็ตรหัสผ่าน' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'รีเซ็ตรหัสผ่าน' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('รีเซ็ตแล้ว'));
    const [url, init] = lastCall(fetchMock);
    expect([url, init.method, init.body]).toEqual(['/api/hr/people/p1/password', 'POST', undefined]);
  });

  it('shows a person their own account without a reset, pointing to เปลี่ยนรหัสผ่าน', () => {
    render(<AccountForm personId="p1" username="somjai" self />);
    expect(screen.queryByRole('button', { name: 'รีเซ็ตรหัสผ่าน' })).toBeNull();
    expect(screen.getByRole('link', { name: 'เปลี่ยนรหัสผ่าน' })).toHaveAttribute('href', '/change-password');
  });

  it('creates an account for a person without one', async () => {
    const fetchMock = respond(201, { ok: true });
    vi.stubGlobal('fetch', fetchMock);
    render(<AccountForm personId="p1" username={null} />);
    expect(screen.getByText('ยังไม่มีบัญชีผู้ใช้')).toBeInTheDocument();
    type(/ชื่อผู้ใช้/, 'somjai');
    type('รหัสผ่าน', 'long-enough-1');
    type('ยืนยันรหัสผ่าน', 'long-enough-1');
    fireEvent.click(screen.getByRole('button', { name: 'สร้างบัญชีผู้ใช้' }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    const [url, init] = lastCall(fetchMock);
    expect([url, init.method]).toEqual(['/api/hr/people/p1/account', 'POST']);
  });

  it('explains why HR cannot reset the password of a protected account', async () => {
    vi.stubGlobal('fetch', respond(409, { error: 'PROTECTED_ACCOUNT' }));
    render(<AccountForm personId="p1" username="admin" />);
    fireEvent.click(screen.getByRole('button', { name: 'รีเซ็ตรหัสผ่าน' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'รีเซ็ตรหัสผ่าน' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('ผู้ดูแลระบบ');
  });
});
