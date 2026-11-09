import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { LinkProviderForm } from './link-provider-form';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
afterEach(() => { vi.restoreAllMocks(); push.mockReset(); });

function fill() {
  fireEvent.change(screen.getByLabelText('ชื่อผู้ใช้'), { target: { value: ' somchai ' } });
  fireEvent.change(screen.getByLabelText('รหัสผ่าน'), { target: { value: 'pw' } });
  fireEvent.click(screen.getByRole('button', { name: 'ผูกบัญชีและเข้าสู่ระบบ' }));
}

describe('LinkProviderForm', () => {
  it('posts the credentials and goes to the dashboard', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ authenticated: true, mustChangePassword: false }), { status: 200 }));
    render(<LinkProviderForm />);
    fill();
    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'));
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/provider/link', expect.objectContaining({ method: 'POST', body: JSON.stringify({ username: 'somchai', password: 'pw' }) }));
  });

  it('goes to change-password when required', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ authenticated: true, mustChangePassword: true }), { status: 200 }));
    render(<LinkProviderForm />);
    fill();
    await waitFor(() => expect(push).toHaveBeenCalledWith('/change-password'));
  });

  it.each([
    [409, 'already_linked', 'บัญชีบุคลากรนี้ผูกกับ Provider ID อื่นแล้ว กรุณาติดต่อผู้ดูแลระบบ'],
    [410, 'ticket_expired', 'หมดเวลาผูกบัญชี กรุณาเข้าสู่ระบบด้วย Provider ID ใหม่'],
    [429, 'login_locked', 'บัญชีถูกล็อกชั่วคราวเพราะกรอกรหัสผ่านผิดหลายครั้ง กรุณาลองใหม่ภายหลัง'],
    [401, 'invalid_credentials', 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง']
  ])('shows the message for %i', async (status, error, message) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error }), { status }));
    render(<LinkProviderForm />);
    fill();
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(push).not.toHaveBeenCalled();
  });

  it('asks for both fields before posting', () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    render(<LinkProviderForm />);
    fireEvent.click(screen.getByRole('button', { name: 'ผูกบัญชีและเข้าสู่ระบบ' }));
    expect(screen.getByRole('alert')).toHaveTextContent('กรอกชื่อผู้ใช้และรหัสผ่านให้ครบ');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
