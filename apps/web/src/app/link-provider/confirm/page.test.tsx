import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { sealThaidLink, ticketHashOf } from '../../../lib/thaid';

const mocks = vi.hoisted(() => ({ cookies: vi.fn(), redirect: vi.fn(), push: vi.fn(), pendingLogin: vi.fn(), thaid: vi.fn(), query: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: mocks.cookies }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, useRouter: () => ({ push: mocks.push, refresh: vi.fn() }) }));
vi.mock('../../../lib/database', () => ({ getSharedDatabase: () => ({ query: mocks.query }) }));
vi.mock('../../../lib/thaid', async (importOriginal) => ({ ...await importOriginal<typeof import('../../../lib/thaid')>(), thaidConfig: mocks.thaid }));
vi.mock('../../../lib/provider-sso', async (importOriginal) => ({ ...await importOriginal<typeof import('../../../lib/provider-sso')>(), providerSsoConfig: async () => ({ apiUrl: 'https://provider.test' }), externalLoginService: () => ({ pendingLogin: mocks.pendingLogin }) }));

import * as page from './page';

const ConfirmPage = page.default;
const secret = 'thaid-secret';
const jar = (values: Record<string, string>) => mocks.cookies.mockResolvedValue({ get: (name: string) => (values[name] ? { value: values[name] } : undefined) });
const ready = (linkTicket = 'ticket-1') => {
  mocks.thaid.mockResolvedValue({ clientSecret: secret });
  mocks.pendingLogin.mockResolvedValue({ displayName: 'สมชาย ใจดี (Provider ID)' });
  mocks.query.mockResolvedValue([{ displayName: 'นายสมชาย ใจดี' }]);
  jar({ backoffice_thaid_link: sealThaidLink({ personId: 'person-1', ticketHash: ticketHashOf(linkTicket) }, secret), backoffice_provider_ticket: 'ticket-1' });
};
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

it('renders per request', () => {
  expect(page.dynamic).toBe('force-dynamic');
});

it('shows whom ThaID confirmed and which Provider ID account will be linked, and links only after the person confirms', async () => {
  ready();
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ next: '/dashboard' }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  render(await ConfirmPage());
  expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('FROM person'), ['person-1']);
  expect(screen.getByText('นายสมชาย ใจดี')).toBeInTheDocument();
  expect(screen.getByText('สมชาย ใจดี (Provider ID)')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'ไม่ใช่บัญชีของฉัน' })).toHaveAttribute('href', '/link-provider');
  fireEvent.click(screen.getByRole('button', { name: 'ผูกบัญชีและเข้าสู่ระบบ' }));
  expect(fetchMock).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'ยืนยันผูกบัญชี' }));
  await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/dashboard'));
  expect(fetchMock).toHaveBeenCalledWith('/api/auth/thaid/link', expect.objectContaining({ method: 'POST' }));
});

it('a refused link shows a message in the dialog and does not move on', async () => {
  ready();
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'link_failed' }), { status: 409 })));
  render(await ConfirmPage());
  fireEvent.click(screen.getByRole('button', { name: 'ผูกบัญชีและเข้าสู่ระบบ' }));
  fireEvent.click(screen.getByRole('button', { name: 'ยืนยันผูกบัญชี' }));
  expect(await screen.findByText(/ผูกบัญชีไม่สำเร็จ/)).toBeInTheDocument();
  expect(mocks.push).not.toHaveBeenCalled();
});

it('sends a missing, expired or mismatched link back to รอผูกบัญชี', async () => {
  ready('ticket-2');
  await ConfirmPage();
  expect(mocks.redirect).toHaveBeenCalledWith('/link-provider?thaid=failed');
  mocks.redirect.mockClear();
  ready();
  mocks.pendingLogin.mockResolvedValue(null);
  await ConfirmPage();
  expect(mocks.redirect).toHaveBeenCalledWith('/link-provider?thaid=failed');
  mocks.redirect.mockClear();
  jar({ backoffice_provider_ticket: 'ticket-1' });
  await ConfirmPage();
  expect(mocks.redirect).toHaveBeenCalledWith('/link-provider?thaid=failed');
});
