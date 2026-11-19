import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }) }));

import { AccountForm, DeletePersonButton, IdentityForm, NewPersonForm } from './hr-account-forms';

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
  }

  it('creates the person with กลุ่มงาน, งาน and position, tells the temporary password, then opens their page', async () => {
    const fetchMock = respond(201, { ok: true, id: 'person-new' });
    vi.stubGlobal('fetch', fetchMock);
    render(<NewPersonForm employmentTypes={[]} units={units} positions={positions} />);
    fillRequired();
    type('กลุ่มงาน', 'กลุ่มการพยาบาล');
    type('งาน', 'งานผู้ป่วยใน');
    type('ตำแหน่งงาน', 'เจ้าพนักงานธุรการ');
    type('ระดับตำแหน่ง', 'ปฏิบัติงาน');
    expect(screen.queryByLabelText('รหัสผ่าน')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกบุคลากรใหม่' }));
    const notice = await screen.findByRole('dialog', { name: 'สร้างบัญชีผู้ใช้แล้ว' });
    expect(notice).toHaveTextContent('P@ssw0rd#1');
    expect(mocks.push).not.toHaveBeenCalled();
    fireEvent.click(within(notice).getByRole('button', { name: 'ตกลง' }));
    expect(mocks.push).toHaveBeenCalledWith('/hr/people/person-new');
    const [url, init] = lastCall(fetchMock);
    expect(url).toBe('/api/hr/people');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ nationalId: '1101700230708', firstName: 'สมใจ', lastName: 'ใจดี', username: 'somjai', organizationId: 'ipd', positionTitle: 'เจ้าพนักงานธุรการ', positionLevel: 'ปฏิบัติงาน' });
    expect(body).not.toHaveProperty('password');
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
  it('shows the username and รหัสบุคลากร as fixed and sends only สถานะ and a new ID, leaving a blank national ID unchanged', async () => {
    const fetchMock = respond(200, { ok: true });
    vi.stubGlobal('fetch', fetchMock);
    render(<IdentityForm personId="p1" values={{ employeeCode: 'E1', employmentStatus: 'ACTIVE' }} username="somjai" />);
    expect(screen.getByLabelText(/ชื่อผู้ใช้/)).toHaveAttribute('readonly');
    expect(screen.getByLabelText('รหัสบุคลากร')).toHaveValue('E1');
    expect(screen.getByLabelText('รหัสบุคลากร')).toHaveAttribute('readonly');
    expect(within(screen.getByLabelText('สถานะ')).getAllByRole('option').map((option) => option.textContent)).toEqual(['ปฏิบัติงาน', 'ย้าย', 'ลาออก']);
    fireEvent.change(screen.getByLabelText('สถานะ'), { target: { value: 'TRANSFERRED' } });
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกข้อมูลระบุตัวตน' }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    const [url, init] = lastCall(fetchMock);
    expect(url).toBe('/api/hr/people/p1/identity');
    expect(JSON.parse(init.body as string)).toEqual({ employmentStatus: 'TRANSFERRED' });
  });

  it('does not offer a person their own สถานะ', async () => {
    const fetchMock = respond(200, { ok: true });
    vi.stubGlobal('fetch', fetchMock);
    render(<IdentityForm personId="p1" values={{ employeeCode: 'E1', employmentStatus: 'ACTIVE' }} username="somjai" self />);
    expect(screen.queryByLabelText('สถานะ')).toBeNull();
    expect(screen.getByText('ปฏิบัติงาน')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกข้อมูลระบุตัวตน' }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect(JSON.parse(lastCall(fetchMock)[1].body as string)).toEqual({});
  });
});

describe('AccountForm', () => {
  it('hides รีเซ็ตรหัสผ่าน and เปลี่ยนรหัสผ่าน while password sign-in is closed, and says why', () => {
    const { unmount } = render(<AccountForm personId="p1" username="somjai" passwordOpen={false} />);
    expect(screen.queryByRole('button', { name: 'รีเซ็ตรหัสผ่าน' })).toBeNull();
    expect(screen.getByText(/การเข้าสู่ระบบด้วยชื่อผู้ใช้และรหัสผ่านปิดอยู่/)).toBeInTheDocument();
    unmount();
    render(<AccountForm personId="p1" username="somjai" self passwordOpen={false} />);
    expect(screen.queryByRole('link', { name: 'เปลี่ยนรหัสผ่าน' })).toBeNull();
  });

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
    expect(screen.queryByLabelText('รหัสผ่าน')).toBeNull();
    type(/ชื่อผู้ใช้/, 'somjai');
    fireEvent.click(screen.getByRole('button', { name: 'สร้างบัญชีผู้ใช้' }));
    const notice = await screen.findByRole('dialog', { name: 'สร้างบัญชีผู้ใช้แล้ว' });
    expect(notice).toHaveTextContent('P@ssw0rd#1');
    fireEvent.click(within(notice).getByRole('button', { name: 'ตกลง' }));
    expect(mocks.refresh).toHaveBeenCalled();
    const [url, init] = lastCall(fetchMock);
    expect([url, init.method, JSON.parse(init.body as string)]).toEqual(['/api/hr/people/p1/account', 'POST', { username: 'somjai' }]);
  });

  it('explains why HR cannot reset the password of a protected account', async () => {
    vi.stubGlobal('fetch', respond(409, { error: 'PROTECTED_ACCOUNT' }));
    render(<AccountForm personId="p1" username="admin" />);
    fireEvent.click(screen.getByRole('button', { name: 'รีเซ็ตรหัสผ่าน' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'รีเซ็ตรหัสผ่าน' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('ผู้ดูแลระบบ');
  });
});

describe('DeletePersonButton', () => {
  it('asks to confirm, deletes the person and goes back to the register', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<DeletePersonButton personId="p9" name="สมใจ ใจดี" />);
    fireEvent.click(screen.getByRole('button', { name: 'ลบบุคลากร' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/สมใจ ใจดี/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'ลบบุคลากร' }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/hr/people'));
    expect(fetchMock).toHaveBeenCalledWith('/api/hr/people/p9', { method: 'DELETE' });
  });

  it('keeps the dialog open with the reason when the person cannot be deleted', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'PROTECTED_ACCOUNT' }), { status: 409 })));
    render(<DeletePersonButton personId="p9" name="สมใจ ใจดี" />);
    fireEvent.click(screen.getByRole('button', { name: 'ลบบุคลากร' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ลบบุคลากร' }));
    expect(await within(screen.getByRole('dialog')).findByText('ลบไม่ได้: เป็นตัวคุณเอง หรือเป็นผู้มีบทบาทในระบบ (ให้ผู้ดูแลระบบลบ)')).toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
