import { render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ headers: vi.fn(), redirect: vi.fn(), readSession: vi.fn(), readPendingPasswordChange: vi.fn() }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('../../lib/session', () => ({ readSession: mocks.readSession, readPendingPasswordChange: mocks.readPendingPasswordChange }));

import ChangePasswordPage from './page';

afterEach(() => vi.clearAllMocks());

it('shows the forced step to a person whose password was reset', async () => {
  mocks.headers.mockResolvedValue(new Headers());
  mocks.readSession.mockResolvedValue(null);
  mocks.readPendingPasswordChange.mockResolvedValue({ personId: 'p1' });
  render(await ChangePasswordPage());
  expect(screen.getByText('รหัสผ่านของคุณถูกรีเซ็ต ตั้งรหัสผ่านใหม่ก่อนใช้งานระบบ')).toBeInTheDocument();
  expect(screen.queryByLabelText('รหัสผ่านปัจจุบัน')).toBeNull();
});

it('asks a signed-in person for the current password, and sends anyone else to sign in', async () => {
  mocks.headers.mockResolvedValue(new Headers());
  mocks.readSession.mockResolvedValue({ authenticated: true, personId: 'p1', roles: [], dataOwnerModules: [] });
  mocks.readPendingPasswordChange.mockResolvedValue(null);
  render(await ChangePasswordPage());
  expect(screen.getByLabelText('รหัสผ่านปัจจุบัน')).toBeInTheDocument();
  mocks.readSession.mockResolvedValue(null);
  await ChangePasswordPage();
  expect(mocks.redirect).toHaveBeenCalledWith('/');
});
