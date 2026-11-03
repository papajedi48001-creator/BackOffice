import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import { LineSettings } from './line-settings';

const group = `C${'cd'.repeat(16)}`;
const props = {
  groups: [{ groupId: group, displayName: 'หัวหน้างาน', source: 'WEBHOOK' as const, active: true, joinedAt: '2026-11-03T03:00:00.000Z' }],
  modules: [{ code: 'room-booking', label: 'จองห้องประชุม', groupId: null }, { code: 'leave', label: 'การลา', groupId: group }]
};
const ok = () => vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
afterEach(() => { vi.unstubAllGlobals(); refresh.mockReset(); });

describe('LineSettings', () => {
  it('lists groups and each module\'s group, "ไม่ส่ง LINE" when none', () => {
    render(<LineSettings {...props} />);
    const modules = screen.getByRole('table', { name: 'กลุ่มแจ้งเตือนของโมดูล' });
    expect(within(modules).getByRole('row', { name: /จองห้องประชุม/ })).toHaveTextContent('ไม่ส่ง LINE');
    expect(within(modules).getByRole('row', { name: /การลา/ })).toHaveTextContent('หัวหน้างาน');
  });

  it('sets a module\'s group in a popup', async () => {
    const fetchMock = ok();
    vi.stubGlobal('fetch', fetchMock);
    render(<LineSettings {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'แก้ไขกลุ่มของ จองห้องประชุม' }));
    const dialog = await screen.findByRole('dialog', { name: 'กลุ่มแจ้งเตือน: จองห้องประชุม' });
    fireEvent.change(within(dialog).getByLabelText('กลุ่ม LINE'), { target: { value: group } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'บันทึก' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/admin/line/routes/room-booking', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ groupId: group }) })));
    expect(refresh).toHaveBeenCalled();
  });

  it('adds a group by its id in a popup', async () => {
    const fetchMock = ok();
    vi.stubGlobal('fetch', fetchMock);
    render(<LineSettings {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'เพิ่มกลุ่มเอง' }));
    const dialog = await screen.findByRole('dialog', { name: 'เพิ่มกลุ่มเอง' });
    fireEvent.change(within(dialog).getByLabelText('รหัสกลุ่ม'), { target: { value: group } });
    fireEvent.change(within(dialog).getByLabelText('ชื่อกลุ่ม'), { target: { value: 'กลุ่มพัสดุ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'บันทึก' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/admin/line/groups', expect.objectContaining({ method: 'POST', body: JSON.stringify({ groupId: group, displayName: 'กลุ่มพัสดุ' }) })));
  });

  it('sends a test message after confirming', async () => {
    const fetchMock = ok();
    vi.stubGlobal('fetch', fetchMock);
    render(<LineSettings {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'ส่งข้อความทดสอบถึง หัวหน้างาน' }));
    const confirm = await screen.findByRole('dialog', { name: 'ส่งข้อความทดสอบ: หัวหน้างาน' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'ส่งข้อความทดสอบ' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`/api/admin/line/groups/${group}/test`, expect.objectContaining({ method: 'POST' })));
    expect(await screen.findByRole('status')).toHaveTextContent('ส่งข้อความทดสอบแล้ว');
  });
});
