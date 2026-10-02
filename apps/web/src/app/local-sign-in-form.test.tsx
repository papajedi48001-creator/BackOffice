import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { LocalSignInForm } from './local-sign-in-form';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

afterEach(() => {
  vi.restoreAllMocks();
  push.mockReset();
});

test('submits local pilot credentials and navigates to the dashboard', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ authenticated: true }), { status: 200 }));
  render(<LocalSignInForm />);

  fireEvent.change(screen.getByLabelText('ชื่อผู้ใช้'), { target: { value: 'r0-e2e-requestor' } });
  fireEvent.change(screen.getByLabelText('รหัสผ่าน'), { target: { value: 'temporary-pilot-password' } });
  fireEvent.submit(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }).closest('form')!);

  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/auth/local', expect.objectContaining({
    method: 'POST',
    body: JSON.stringify({ username: 'r0-e2e-requestor', password: 'temporary-pilot-password' }),
  })));
  expect(push).toHaveBeenCalledWith('/dashboard');
});

test('shows a Thai generic error for rejected credentials', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: 'invalid_credentials' }), { status: 401 }));
  render(<LocalSignInForm />);

  fireEvent.change(screen.getByLabelText('ชื่อผู้ใช้'), { target: { value: 'r0-e2e-requestor' } });
  fireEvent.change(screen.getByLabelText('รหัสผ่าน'), { target: { value: 'wrong-password' } });

  fireEvent.submit(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }).closest('form')!);

  expect(await screen.findByRole('alert')).toHaveTextContent('ไม่สามารถเข้าสู่ระบบได้ โปรดตรวจสอบชื่อผู้ใช้และรหัสผ่าน');
});
