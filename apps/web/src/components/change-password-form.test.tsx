import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChangePasswordForm } from './change-password-form';

const respond = (status: number, body: unknown) => vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
afterEach(() => { vi.unstubAllGlobals(); });

describe('ChangePasswordForm', () => {
  it('after a reset asks only for the new password twice, then tells the person to sign in again', async () => {
    const fetchMock = respond(200, { ok: true });
    vi.stubGlobal('fetch', fetchMock);
    render(<ChangePasswordForm forced />);
    expect(screen.queryByLabelText('รหัสผ่านปัจจุบัน')).toBeNull();
    type('รหัสผ่านใหม่', 'brand-new-pass');
    type('ยืนยันรหัสผ่าน', 'brand-new-pass');
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกรหัสผ่านใหม่' }));
    expect(await screen.findByRole('link', { name: 'เข้าสู่ระบบด้วยรหัสผ่านใหม่' })).toHaveAttribute('href', '/');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/auth/password');
    expect(JSON.parse(init.body as string)).toEqual({ newPassword: 'brand-new-pass' });
  });

  it('otherwise needs the current password, and explains a wrong one', async () => {
    const fetchMock = respond(400, { error: 'WRONG_PASSWORD' });
    vi.stubGlobal('fetch', fetchMock);
    render(<ChangePasswordForm forced={false} />);
    type('รหัสผ่านปัจจุบัน', 'old-pass-1');
    type('รหัสผ่านใหม่', 'brand-new-pass');
    type('ยืนยันรหัสผ่าน', 'brand-new-pass');
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกรหัสผ่านใหม่' }));
    await waitFor(() => expect(screen.getAllByRole('alert').at(-1)).toHaveTextContent('รหัสผ่านปัจจุบันไม่ถูกต้อง'));
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ currentPassword: 'old-pass-1', newPassword: 'brand-new-pass' });
  });

  it('refuses the default password as the new one before sending', () => {
    const fetchMock = respond(200, { ok: true });
    vi.stubGlobal('fetch', fetchMock);
    render(<ChangePasswordForm forced />);
    type('รหัสผ่านใหม่', 'P@ssw0rd#1');
    type('ยืนยันรหัสผ่าน', 'P@ssw0rd#1');
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกรหัสผ่านใหม่' }));
    expect(screen.getAllByRole('alert').at(-1)).toHaveTextContent('ต้องไม่ซ้ำ');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
