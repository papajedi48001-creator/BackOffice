import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { RolePicker } from './role-picker';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));

afterEach(() => { vi.restoreAllMocks(); push.mockReset(); refresh.mockReset(); });

const choices = [
  { code: 'admin', name: 'ผู้ดูแลระบบ', description: 'ตั้งค่าระบบ' },
  { code: 'leave-manager', name: 'ผู้จัดการการลา', description: 'ดูแลงานการลา' },
  { code: 'employee', name: 'บุคลากรทั่วไป', description: 'ใช้สิทธิ์พื้นฐาน' }
];

test('lists every role as a button with its Thai name and description and marks the current one', () => {
  render(<RolePicker choices={choices} current="leave-manager" />);
  expect(screen.getAllByRole('button')).toHaveLength(3);
  expect(screen.getByRole('button', { name: /ผู้ดูแลระบบ/ })).toHaveTextContent('ตั้งค่าระบบ');
  expect(screen.getByRole('button', { name: /ผู้จัดการการลา/ })).toHaveAttribute('aria-current', 'true');
  expect(screen.getByRole('button', { name: /บุคลากรทั่วไป/ })).toBeInTheDocument();
});

test('saves the chosen role on the server and goes to หน้าหลัก', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ activeRole: 'admin' }), { status: 200 }));
  render(<RolePicker choices={choices} current={null} />);
  fireEvent.click(screen.getByRole('button', { name: /ผู้ดูแลระบบ/ }));
  await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'));
  expect(fetchMock).toHaveBeenCalledWith('/api/auth/role', expect.objectContaining({ method: 'POST', body: JSON.stringify({ role: 'admin' }) }));
});

test('stays on the picker with a message when the server refuses the role', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: 'role_not_held' }), { status: 403 }));
  render(<RolePicker choices={choices} current={null} />);
  fireEvent.click(screen.getByRole('button', { name: /ผู้จัดการการลา/ }));
  expect(await screen.findByRole('alert')).toHaveTextContent('คุณไม่มีบทบาทนี้แล้ว');
  expect(push).not.toHaveBeenCalled();
  expect(refresh).toHaveBeenCalled();
});
