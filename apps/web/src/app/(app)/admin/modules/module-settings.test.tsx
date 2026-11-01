import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModuleSettings, type ModuleSettingRow } from './module-settings';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const rows: ModuleSettingRow[] = [
  { code: 'fleet', label: 'ยานพาหนะ', description: 'ขอใช้รถ', mode: 'ON', locked: false, managerRole: 'fleet-manager', managers: [{ personId: 'p-adm', displayName: 'นางมาลัย ข้อมูลจำลอง', employeeCode: 'ADM003', ownsHrData: false, active: true }], testerRole: 'fleet-tester', testers: [{ personId: 'p-nur', displayName: 'นางสาวทดสอบ ระบบจำลอง', employeeCode: 'NUR014', ownsHrData: false, active: true }] },
  { code: 'leave', label: 'การลา', description: 'ใบลา', mode: 'OFF', locked: false, managerRole: 'leave-manager', managers: [], testerRole: 'leave-tester', testers: [] },
  { code: 'access', label: 'สิทธิ์และการตรวจสอบ', description: 'บทบาท', mode: 'DEVELOPMENT', locked: false, managerRole: null, managers: [], testerRole: 'access-tester', testers: [] },
  { code: 'admin', label: 'ผู้ดูแลระบบ', description: 'ตั้งค่า', mode: 'ON', locked: true, managerRole: null, managers: [], testerRole: null, testers: [] }
];
const admins = [{ personId: 'p-it', displayName: 'นายจีระศักดิ์ หอกคำ', employeeCode: 'IT001', ownsHrData: false, active: true }];

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('ModuleSettings', () => {
  it('shows a three-way เปิด/พัฒนา/ปิด control per module, and none for the admin module', () => {
    render(<ModuleSettings rows={rows} admins={admins} />);
    const fleet = screen.getByRole('group', { name: 'โหมด ยานพาหนะ' });
    expect(within(fleet).getAllByRole('button').map((button) => button.textContent)).toEqual(['เปิด', 'พัฒนา', 'ปิด']);
    expect(within(fleet).getByRole('button', { name: 'เปิด' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(screen.getByRole('group', { name: 'โหมด สิทธิ์และการตรวจสอบ' })).getByRole('button', { name: 'พัฒนา' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('group', { name: 'โหมด ผู้ดูแลระบบ' })).toBeNull();
    expect(screen.getByText('เปิดตลอด')).toBeInTheDocument();
  });

  it('changes a module\'s mode only after the confirm popup, naming the old and new mode', async () => {
    const fetchMock = vi.fn(async () => json({ ok: true, changed: true }));
    vi.stubGlobal('fetch', fetchMock);
    render(<ModuleSettings rows={rows} admins={admins} />);
    fireEvent.click(within(screen.getByRole('group', { name: 'โหมด ยานพาหนะ' })).getByRole('button', { name: 'พัฒนา' }));
    expect(fetchMock).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('เปิด → พัฒนา');
    fireEvent.click(within(dialog).getByRole('button', { name: 'เปลี่ยนเป็นพัฒนา' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe('/api/admin/modules/fleet');
    expect(JSON.parse(init.body as string)).toEqual({ mode: 'DEVELOPMENT' });
  });

  it('lists the module\'s ผู้ทดสอบ in its popup and adds one with the tester role', async () => {
    const fetchMock = vi.fn(async (url: string) => url.startsWith('/api/admin/people?') ? json({ people: [{ personId: 'p-hr', displayName: 'นายทดลอง ใจดี', employeeCode: 'HR001', organizationName: null }] }) : json({ ok: true, changed: true }));
    vi.stubGlobal('fetch', fetchMock);
    render(<ModuleSettings rows={rows} admins={admins} />);
    fireEvent.click(screen.getByRole('button', { name: 'ยานพาหนะ' }));
    const popup = screen.getByRole('dialog');
    expect(popup).toHaveTextContent('ผู้ทดสอบยานพาหนะ');
    expect(popup).toHaveTextContent('นางสาวทดสอบ ระบบจำลอง');
    fireEvent.click(within(popup).getByLabelText('ผู้ทดสอบ'));
    fireEvent.change(within(popup).getByLabelText('ค้นหาบุคลากร (ชื่อหรือรหัส)'), { target: { value: 'HR001' } });
    fireEvent.click(await within(popup).findByRole('button', { name: /นายทดลอง ใจดี/ }));
    fireEvent.click(within(popup).getByRole('button', { name: 'เพิ่ม' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const call = fetchMock.mock.calls.find(([url]) => url === '/api/admin/people/p-hr/roles')! as unknown as [string, RequestInit];
    expect(JSON.parse(call[1].body as string)).toEqual({ roleName: 'fleet-tester' });
  });

  it('opens the module\'s managers in a popup and removes one after a confirm', async () => {
    const fetchMock = vi.fn(async () => json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    render(<ModuleSettings rows={rows} admins={admins} />);
    fireEvent.click(screen.getByRole('button', { name: 'ยานพาหนะ' }));
    const popup = screen.getByRole('dialog');
    expect(popup).toHaveTextContent('ผู้จัดการยานพาหนะ');
    expect(popup).toHaveTextContent('นายจีระศักดิ์ หอกคำ');
    fireEvent.click(within(popup).getByRole('button', { name: 'ลบ นางมาลัย ข้อมูลจำลอง' }));
    const confirm = screen.getAllByRole('dialog').at(-1)!;
    fireEvent.click(within(confirm).getByRole('button', { name: 'ลบ' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe('/api/admin/people/p-adm/roles/fleet-manager');
    expect(init.method).toBe('DELETE');
  });
});
