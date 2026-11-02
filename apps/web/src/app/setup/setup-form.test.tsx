import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

import { SetupForm } from './setup-form';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const type = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

function fillDatabase() {
  type('รหัส setup', 'ABCD-EFGH-JKLM');
  type('เครื่องฐานข้อมูล (host)', '192.168.1.254');
  type('ชื่อผู้ใช้ฐานข้อมูล', 'backoffice');
  type('รหัสผ่านฐานข้อมูล', 'db-secret');
}
function fillAdmin(confirm = 'long-enough-pw') {
  type('ชื่อ', 'จีระศักดิ์'); type('นามสกุล', 'หอกคำ'); type('รหัสบุคลากร', 'IT001');
  type('เลขประจำตัวประชาชน', '1101700230708'); type('ชื่อผู้ใช้', 'it001');
  type('รหัสผ่าน', 'long-enough-pw'); type('ยืนยันรหัสผ่าน', confirm);
}

afterEach(() => { vi.restoreAllMocks(); push.mockReset(); });

describe('SetupForm', () => {
  it('shows the server version and pending migrations after a connection test', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ ok: true, serverVersion: '11.8.3-MariaDB', pendingMigrations: 21, hasAccounts: false }));
    render(<SetupForm missingKeys={[]} />);
    fillDatabase();
    fireEvent.click(screen.getByRole('button', { name: 'ทดสอบการเชื่อมต่อ' }));
    expect(await screen.findByText(/MariaDB 11\.8\.3/)).toBeInTheDocument();
    expect(screen.getByText(/migration ที่ยังไม่ได้รัน 21 รายการ/)).toBeInTheDocument();
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body))).toEqual({ code: 'ABCD-EFGH-JKLM', database: { host: '192.168.1.254', port: 3306, database: 'backoffice', username: 'backoffice', password: 'db-secret' } });
  });

  it('does not send when the password confirmation differs', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    render(<SetupForm missingKeys={[]} />);
    fillDatabase(); fillAdmin('something-else');
    fireEvent.submit(screen.getByRole('button', { name: 'บันทึกและสร้างบัญชี' }).closest('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent('รหัสผ่านยืนยันไม่ตรงกัน');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('warns against the root database user', () => {
    render(<SetupForm missingKeys={[]} />);
    type('ชื่อผู้ใช้ฐานข้อมูล', 'root');
    expect(screen.getByText('ควรใช้ผู้ใช้ฐานข้อมูลเฉพาะของระบบ ไม่ใช่ root')).toBeInTheDocument();
  });

  it('explains a missing migration privilege in Thai', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ ok: false, error: 'migration_privilege_missing' }, 400));
    render(<SetupForm missingKeys={[]} />);
    fillDatabase(); fillAdmin();
    fireEvent.submit(screen.getByRole('button', { name: 'บันทึกและสร้างบัญชี' }).closest('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent('ผู้ใช้ฐานข้อมูลนี้สร้างตารางไม่ได้');
  });

  it('saves and sends the installer to sign in', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ ok: true }));
    render(<SetupForm missingKeys={[]} />);
    fillDatabase(); fillAdmin();
    fireEvent.submit(screen.getByRole('button', { name: 'บันทึกและสร้างบัญชี' }).closest('form')!);
    await waitFor(() => expect(push).toHaveBeenCalledWith('/'));
    expect(fetchMock).toHaveBeenCalledWith('/api/setup/complete', expect.objectContaining({ method: 'POST' }));
    const sent = JSON.parse(String(fetchMock.mock.calls[0]![1]!.body));
    expect(sent.admin).toEqual({ firstName: 'จีระศักดิ์', lastName: 'หอกคำ', employeeCode: 'IT001', nationalId: '1101700230708', username: 'it001', password: 'long-enough-pw' });
  });

  it('keeps every password field hidden and out of autofill', () => {
    render(<SetupForm missingKeys={[]} />);
    for (const label of ['รหัสผ่านฐานข้อมูล', 'รหัสผ่าน', 'ยืนยันรหัสผ่าน']) {
      const input = screen.getByLabelText(label);
      expect(input).toHaveAttribute('type', 'password');
      expect(input).toHaveAttribute('autocomplete', 'new-password');
    }
  });
});
