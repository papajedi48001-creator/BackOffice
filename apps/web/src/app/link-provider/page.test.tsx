import { render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ cookies: vi.fn(), redirect: vi.fn(), pendingLogin: vi.fn(), config: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: mocks.cookies }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('../../lib/database', () => ({ getSharedDatabase: () => ({}) }));
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

it('shows the Provider ID name so a person on a shared computer does not link someone else\'s account', async () => {
  mocks.config.mockReturnValue({ issuer: 'https://portal.test' });
  withTicket('ticket-1');
  mocks.pendingLogin.mockResolvedValue({ displayName: 'สมชาย ใจดี' });
  render(await LinkProviderPage());
  expect(mocks.pendingLogin).toHaveBeenCalledWith('ticket-1');
  expect(screen.getByText('สมชาย ใจดี')).toBeInTheDocument();
  expect(screen.getByText(/ถ้าไม่ใช่ชื่อของคุณ/)).toBeInTheDocument();
  expect(screen.getByLabelText('ชื่อผู้ใช้')).toBeInTheDocument();
});

it('sends a missing or expired ticket back to the sign-in page', async () => {
  mocks.config.mockReturnValue({ issuer: 'https://portal.test' });
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
