import { render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ cookies: vi.fn(), redirect: vi.fn(), pendingLogin: vi.fn(), config: vi.fn(), thaid: vi.fn(async () => null as object | null), protector: vi.fn(() => ({}) as object | null) }));
vi.mock('next/headers', () => ({ cookies: mocks.cookies }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('../../lib/database', () => ({ getSharedDatabase: () => ({}) }));
vi.mock('../../lib/national-id', () => ({ getNationalIdProtector: () => mocks.protector() }));
vi.mock('../../lib/thaid', () => ({ thaidConfig: mocks.thaid }));
vi.mock('../../lib/provider-sso', () => ({
  providerTicketCookie: 'backoffice_provider_ticket',
  providerSsoConfig: mocks.config,
  externalLoginService: () => ({ pendingLogin: mocks.pendingLogin })
}));

import * as page from './page';

const LinkProviderPage = page.default;
const withTicket = (value?: string) => mocks.cookies.mockResolvedValue({ get: (name: string) => (name === 'backoffice_provider_ticket' && value ? { value } : undefined) });

afterEach(() => vi.clearAllMocks());

it('renders per request so the Provider SSO settings are read at run time, not baked in at build time', () => {
  expect(page.dynamic).toBe('force-dynamic');
});

it('shows the Provider ID name and sends the person to the admin, with no password form', async () => {
  mocks.config.mockReturnValue({ apiUrl: 'https://provider.test' });
  withTicket('ticket-1');
  mocks.pendingLogin.mockResolvedValue({ displayName: 'สมชาย ใจดี' });
  render(await LinkProviderPage());
  expect(mocks.pendingLogin).toHaveBeenCalledWith('ticket-1');
  expect(screen.getByText('สมชาย ใจดี')).toBeInTheDocument();
  expect(screen.getByText(/ถ้าไม่ใช่ชื่อของคุณ/)).toBeInTheDocument();
  expect(screen.getByText(/ติดต่อผู้ดูแลระบบ/)).toBeInTheDocument();
  expect(screen.queryByLabelText('ชื่อผู้ใช้')).toBeNull();
  expect(screen.queryByLabelText('รหัสผ่าน')).toBeNull();
});

it('sends a missing or expired ticket back to the sign-in page', async () => {
  mocks.config.mockReturnValue({ apiUrl: 'https://provider.test' });
  withTicket(undefined);
  mocks.pendingLogin.mockResolvedValue(null);
  await LinkProviderPage();
  expect(mocks.redirect).toHaveBeenCalledWith('/?provider=failed');
});

it('goes to the sign-in page when Provider SSO is off', async () => {
  mocks.config.mockReturnValue(null);
  withTicket('ticket-1');
  await LinkProviderPage();
  expect(mocks.redirect).toHaveBeenCalledWith('/');
});

it('offers ยืนยันด้วย ThaID when ThaID is ready, so the person links the account themselves', async () => {
  mocks.config.mockReturnValue({ apiUrl: 'https://provider.test' });
  mocks.thaid.mockResolvedValue({ clientId: 'c' });
  withTicket('ticket-1');
  mocks.pendingLogin.mockResolvedValue({ displayName: 'สมชาย ใจดี' });
  render(await LinkProviderPage({ searchParams: Promise.resolve({}) }));
  expect(screen.getByRole('link', { name: 'ยืนยันด้วย ThaID' })).toHaveAttribute('href', '/api/auth/thaid/start?purpose=link');
});

it.each([
  ['failed', 'ผูกบัญชีด้วย ThaID ไม่สำเร็จ บัญชีนี้อาจผูกกับ Provider ID อื่นอยู่แล้ว กรุณาติดต่อผู้ดูแลระบบ'],
  ['not_found', 'ไม่พบเลขบัตรประชาชนนี้ในทะเบียนบุคลากร กรุณาติดต่อผู้ดูแลระบบ']
])('says why a ThaID confirmation (%s) did not link', async (outcome, message) => {
  mocks.config.mockReturnValue({ apiUrl: 'https://provider.test' });
  mocks.thaid.mockResolvedValue({ clientId: 'c' });
  withTicket('ticket-1');
  mocks.pendingLogin.mockResolvedValue({ displayName: null });
  render(await LinkProviderPage({ searchParams: Promise.resolve({ thaid: outcome }) }));
  expect(screen.getByRole('alert')).toHaveTextContent(message);
});

it('hides ยืนยันด้วย ThaID when ThaID is not ready', async () => {
  mocks.config.mockReturnValue({ apiUrl: 'https://provider.test' });
  mocks.thaid.mockResolvedValue(null);
  withTicket('ticket-1');
  mocks.pendingLogin.mockResolvedValue({ displayName: null });
  render(await LinkProviderPage({ searchParams: Promise.resolve({}) }));
  expect(screen.queryByRole('link', { name: 'ยืนยันด้วย ThaID' })).toBeNull();
});
