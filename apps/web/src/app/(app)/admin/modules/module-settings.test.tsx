import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModuleSettings, type ModuleSettingRow } from './module-settings';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const rows: ModuleSettingRow[] = [
  { code: 'fleet', label: 'ยานพาหนะ', description: 'ขอใช้รถ', enabled: true, locked: false, managerRole: 'fleet-manager', managers: [{ personId: 'p-adm', displayName: 'นางมาลัย ข้อมูลจำลอง', employeeCode: 'ADM003', ownsHrData: false, active: true }] },
  { code: 'leave', label: 'การลา', description: 'ใบลา', enabled: false, locked: false, managerRole: 'leave-manager', managers: [] },
  { code: 'admin', label: 'ผู้ดูแลระบบ', description: 'ตั้งค่า', enabled: true, locked: true, managerRole: null, managers: [] }
];
const admins = [{ personId: 'p-it', displayName: 'นายจีระศักดิ์ หอกคำ', employeeCode: 'IT001', ownsHrData: false, active: true }];

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('ModuleSettings', () => {
  it('shows each module\'s state, and no switch for the admin module', () => {
    render(<ModuleSettings rows={rows} admins={admins} />);
    expect(screen.getByRole('button', { name: 'ปิดการใช้งาน ยานพาหนะ' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'เปิดการใช้งาน การลา' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /การใช้งาน ผู้ดูแลระบบ/ })).toBeNull();
    expect(screen.getByText('ปิดไม่ได้')).toBeInTheDocument();
  });

  it('switches a module off only after the confirm popup', async () => {
    const fetchMock = vi.fn(async () => json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    render(<ModuleSettings rows={rows} admins={admins} />);
    fireEvent.click(screen.getByRole('button', { name: 'ปิดการใช้งาน ยานพาหนะ' }));
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ปิดการใช้งาน' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe('/api/admin/modules/fleet');
    expect(JSON.parse(init.body as string)).toEqual({ enabled: false });
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
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/admin/people/p-adm/roles/fleet-manager');
    expect((fetchMock.mock.calls[0]![1] as RequestInit).method).toBe('DELETE');
  });
});
