import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    type(/รหัสผ่าน/, 'long-enough-1');
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
  it('sets a new password for a person with an account', async () => {
    const fetchMock = respond(200, { ok: true });
    vi.stubGlobal('fetch', fetchMock);
    render(<AccountForm personId="p1" username="somjai" />);
    type('รหัสผ่านใหม่', 'brand-new-pass');
    fireEvent.click(screen.getByRole('button', { name: 'ตั้งรหัสผ่านใหม่' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('บันทึกแล้ว'));
    const [url, init] = lastCall(fetchMock);
    expect([url, init.method]).toEqual(['/api/hr/people/p1/password', 'PUT']);
    expect(JSON.parse(init.body as string)).toEqual({ password: 'brand-new-pass' });
  });

  it('creates an account for a person without one', async () => {
    const fetchMock = respond(201, { ok: true });
    vi.stubGlobal('fetch', fetchMock);
    render(<AccountForm personId="p1" username={null} />);
    expect(screen.getByText('ยังไม่มีบัญชีผู้ใช้')).toBeInTheDocument();
    type(/ชื่อผู้ใช้/, 'somjai');
    type(/รหัสผ่าน/, 'long-enough-1');
    fireEvent.click(screen.getByRole('button', { name: 'สร้างบัญชีผู้ใช้' }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    const [url, init] = lastCall(fetchMock);
    expect([url, init.method]).toEqual(['/api/hr/people/p1/account', 'POST']);
  });

  it('explains why HR cannot set the password of a protected account, and blocks a second click while saving', async () => {
    let finish: (response: Response) => void = () => undefined;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; }));
    vi.stubGlobal('fetch', fetchMock);
    render(<AccountForm personId="p1" username="admin" />);
    type('รหัสผ่านใหม่', 'brand-new-pass');
    fireEvent.click(screen.getByRole('button', { name: 'ตั้งรหัสผ่านใหม่' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'ตั้งรหัสผ่านใหม่' })).toBeDisabled());
    finish(new Response(JSON.stringify({ error: 'PROTECTED_ACCOUNT' }), { status: 409 }));
    expect(await screen.findByRole('alert')).toHaveTextContent('ผู้ดูแลระบบ');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
