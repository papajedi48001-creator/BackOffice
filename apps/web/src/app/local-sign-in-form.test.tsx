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

test('sends a person whose password was reset to the change-password step', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ authenticated: true, mustChangePassword: true }), { status: 200 })));
  render(<LocalSignInForm />);
  fireEvent.change(screen.getByLabelText('ชื่อผู้ใช้'), { target: { value: 'somjai' } });
  fireEvent.change(screen.getByLabelText('รหัสผ่าน'), { target: { value: 'P@ssw0rd#1' } });
  fireEvent.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }));
  await waitFor(() => expect(push).toHaveBeenCalledWith('/change-password'));
  vi.unstubAllGlobals();
});

test('returns to a page inside the app named by next, and ignores one that leaves it', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ authenticated: true }), { status: 200 })));
  const signIn = async (next: string) => {
    const view = render(<LocalSignInForm next={next} />);
    fireEvent.change(screen.getByLabelText('ชื่อผู้ใช้'), { target: { value: 'somjai' } });
    fireEvent.change(screen.getByLabelText('รหัสผ่าน'), { target: { value: 'P@ssw0rd#1' } });
    fireEvent.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }));
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    const target = push.mock.calls[0]![0];
    push.mockReset();
    view.unmount();
    return target;
  };
  expect(await signIn('/mci/ops')).toBe('/mci/ops');
  expect(await signIn('//evil.example/x')).toBe('/dashboard');
  expect(await signIn('https://evil.example/')).toBe('/dashboard');
  expect(await signIn('/\\evil.example')).toBe('/dashboard');
  vi.unstubAllGlobals();
});

test('shows and hides the password with an eye button inside the password box', () => {
  render(<LocalSignInForm />);
  const password = screen.getByLabelText('รหัสผ่าน');
  const show = screen.getByRole('button', { name: 'แสดงรหัสผ่าน' });
  // The eye sits inside the same box as the input, so both boxes are as wide as each other.
  expect(show.closest('.input-with-icon')).toBe(password.closest('.input-with-icon'));
  expect(show).not.toHaveTextContent(/\S/);
  expect(show.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  expect(password).toHaveAttribute('type', 'password');
  fireEvent.click(show);
  expect(password).toHaveAttribute('type', 'text');
  fireEvent.click(screen.getByRole('button', { name: 'ซ่อนรหัสผ่าน' }));
  expect(password).toHaveAttribute('type', 'password');
});

test('tells a page loaded before password sign-in closed to reload instead of blaming the password', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: 'password_sign_in_off' }), { status: 403 }));
  render(<LocalSignInForm />);
  fireEvent.change(screen.getByLabelText('ชื่อผู้ใช้'), { target: { value: 'r0-e2e-requestor' } });
  fireEvent.change(screen.getByLabelText('รหัสผ่าน'), { target: { value: 'any-password' } });
  fireEvent.submit(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }).closest('form')!);
  expect(await screen.findByRole('alert')).toHaveTextContent('ปิดการเข้าสู่ระบบด้วยรหัสผ่านแล้ว กรุณาโหลดหน้านี้ใหม่แล้วใช้ปุ่มเข้าสู่ระบบด้านล่าง');
});
