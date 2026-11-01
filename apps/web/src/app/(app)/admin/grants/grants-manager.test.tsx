import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GrantsManager } from './grants-manager';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const grants = [
  { personId: 'p-it', displayName: 'นายจีระศักดิ์ หอกคำ', employeeCode: 'IT001', positionTitle: 'นักวิชาการคอมพิวเตอร์', active: true, roleNames: ['admin' as const], ownsHrData: false },
  { personId: 'p-adm', displayName: 'นางมาลัย ข้อมูลจำลอง', employeeCode: 'ADM003', positionTitle: null, active: true, roleNames: ['fleet-manager' as const, 'leave-manager' as const], ownsHrData: false }
];

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('GrantsManager', () => {
  it('lists every person once with all of their roles, and warns where HR data ownership is missing', () => {
    render(<GrantsManager grants={grants} currentPersonId="p-it" />);
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('นายจีระศักดิ์ หอกคำ (คุณ)');
    expect(rows[0]).toHaveTextContent('ผู้ดูแลระบบ');
    expect(within(rows[1]!).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['ผู้จัดการยานพาหนะ', 'ผู้จัดการการลา *']);
  });

  it('edits a person\'s roles in a popup and saves the whole set', async () => {
    const fetchMock = vi.fn(async () => json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    render(<GrantsManager grants={grants} currentPersonId="p-it" />);
    fireEvent.click(screen.getByRole('button', { name: 'แก้ไขสิทธิ นางมาลัย ข้อมูลจำลอง' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByLabelText('ผู้ดูแลระบบ'));
    fireEvent.click(within(dialog).getByLabelText('ผู้จัดการการลา'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'บันทึก' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe('/api/admin/people/p-adm/roles');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({ roleNames: ['fleet-manager', 'admin'] });
  });

  it('shows the server\'s refusal to delete the last admin in Thai and keeps the popup open', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'LAST_ADMIN' }, 409)));
    render(<GrantsManager grants={grants} currentPersonId="p-it" />);
    fireEvent.click(screen.getByRole('button', { name: 'ลบสิทธิทั้งหมด นายจีระศักดิ์ หอกคำ' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ลบสิทธิทั้งหมด' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('ลบผู้ดูแลระบบคนสุดท้ายไม่ได้');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('adds roles for a person found by search', async () => {
    const fetchMock = vi.fn(async (url: string) => url.startsWith('/api/admin/people?') ? json({ people: [{ personId: 'p-nur', displayName: 'นางพรทิพย์ ตัวอย่างงาม', employeeCode: 'NUR001', organizationName: 'กลุ่มการพยาบาล' }] }) : json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    render(<GrantsManager grants={grants} currentPersonId="p-it" />);
    fireEvent.click(screen.getByRole('button', { name: 'เพิ่มสิทธิ' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('ค้นหาบุคลากร (ชื่อหรือรหัส)'), { target: { value: 'พรทิพย์' } });
    fireEvent.click(await within(dialog).findByRole('button', { name: 'เลือก นางพรทิพย์ ตัวอย่างงาม' }));
    fireEvent.click(within(dialog).getByLabelText('ผู้จัดการห้องประชุม'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'บันทึก' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const call = fetchMock.mock.calls.find(([url]) => url === '/api/admin/people/p-nur/roles') as unknown as [string, RequestInit];
    expect(JSON.parse(call[1].body as string)).toEqual({ roleNames: ['room-manager'] });
  });

  it('grants a ผู้ทดสอบ role next to a manager role, from its own group in the popup', async () => {
    const fetchMock = vi.fn(async () => json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    render(<GrantsManager grants={grants} currentPersonId="p-it" />);
    fireEvent.click(screen.getByRole('button', { name: 'แก้ไขสิทธิ นางมาลัย ข้อมูลจำลอง' }));
    const dialog = screen.getByRole('dialog');
    const testers = within(dialog).getByRole('group', { name: 'ผู้ทดสอบโมดูล (เห็นโมดูลที่อยู่ในโหมดพัฒนา)' });
    fireEvent.click(within(testers).getByLabelText('ผู้ทดสอบยานพาหนะ'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'บันทึก' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ roleNames: ['fleet-manager', 'leave-manager', 'fleet-tester'] });
  });
});
