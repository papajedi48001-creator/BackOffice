import { render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ headers: vi.fn(), redirect: vi.fn((href: string) => { throw new Error(`redirect:${href}`); }), readSession: vi.fn() }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, usePathname: () => '/hr/organizations' }));
vi.mock('../lib/session', () => ({ readSession: mocks.readSession }));

import { ModuleIndex, ModuleLayout } from './module-layout';

const session = (roles: Array<{ name: string; organizationId: string | null }>) => ({ authenticated: true, personId: 'p', roles, dataOwnerModules: [] });
afterEach(() => { vi.clearAllMocks(); });

it('opens the first section the person can see', async () => {
  mocks.headers.mockResolvedValue(new Headers());
  mocks.readSession.mockResolvedValue(session([{ name: 'hr-reader', organizationId: 'unit-1' }]));
  await expect(ModuleIndex({ code: 'hr' })).rejects.toThrow('redirect:/hr/people');
});

it('tells a person with no sections that they have no access', async () => {
  mocks.headers.mockResolvedValue(new Headers());
  mocks.readSession.mockResolvedValue(session([]));
  render(await ModuleIndex({ code: 'hr' }));
  expect(screen.getByRole('alert')).toHaveTextContent('คุณไม่มีสิทธิ์ดูข้อมูลส่วนนี้');
});

it('sends a signed-out person to sign in', async () => {
  mocks.headers.mockResolvedValue(new Headers());
  mocks.readSession.mockResolvedValue(undefined);
  await expect(ModuleIndex({ code: 'hr' })).rejects.toThrow('redirect:/');
});

it('shows only the sections the person can see above the page', async () => {
  mocks.headers.mockResolvedValue(new Headers());
  mocks.readSession.mockResolvedValue(session([{ name: 'hr-reader', organizationId: 'unit-1' }]));
  render(await ModuleLayout({ code: 'hr', children: <p>เนื้อหา</p> }));
  expect(screen.getByRole('link', { name: 'หน่วยงาน' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: 'บุคลากร' })).toHaveAttribute('href', '/hr/people');
  expect(screen.queryByRole('link', { name: 'นำเข้าข้อมูลตั้งต้น' })).toBeNull();
  expect(screen.getByText('เนื้อหา')).toBeInTheDocument();
});
