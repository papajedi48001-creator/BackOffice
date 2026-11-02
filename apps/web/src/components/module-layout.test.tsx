import { render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ database: vi.fn((): unknown => null), headers: vi.fn(), redirect: vi.fn((href: string) => { throw new Error(`redirect:${href}`); }), readSession: vi.fn() }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, usePathname: () => '/hr/organizations' }));
vi.mock('../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../lib/database', () => ({ getSharedDatabase: mocks.database }));

import { ModuleIndex, ModuleLayout } from './module-layout';

const session = (roles: Array<{ name: string; organizationId: string | null }>) => ({ authenticated: true, personId: 'p', roles, dataOwnerModules: [] });
afterEach(() => { vi.clearAllMocks(); });

it('opens the first section the person can see', async () => {
  mocks.headers.mockResolvedValue(new Headers());
  mocks.readSession.mockResolvedValue(session([{ name: 'hr-reader', organizationId: 'unit-1' }]));
  await expect(ModuleIndex({ code: 'hr' })).rejects.toThrow('redirect:/hr/people');
});

it('sends a person without HR roles to their own profile', async () => {
  mocks.headers.mockResolvedValue(new Headers());
  mocks.readSession.mockResolvedValue(session([]));
  await expect(ModuleIndex({ code: 'hr' })).rejects.toThrow('redirect:/hr/me');
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

it('shows งานขับของฉัน only to a person on the driver list', async () => {
  mocks.headers.mockResolvedValue(new Headers());
  mocks.readSession.mockResolvedValue(session([]));
  const isDriver = (found: boolean) => ({ query: vi.fn(async (sql: string) => (sql.includes('FROM fleet_driver') ? (found ? [{ found: 1 }] : []) : [{ count: 0 }])) });
  mocks.database.mockReturnValue(isDriver(false));
  const { unmount } = render(await ModuleLayout({ code: 'fleet', children: <p>เนื้อหา</p> }));
  expect(screen.getByRole('link', { name: 'ใบขอใช้รถของฉัน' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /งานขับของฉัน/ })).toBeNull();
  unmount();
  mocks.database.mockReturnValue(isDriver(true));
  render(await ModuleLayout({ code: 'fleet', children: <p>เนื้อหา</p> }));
  expect(screen.getByRole('link', { name: /งานขับของฉัน/ })).toHaveAttribute('href', '/fleet/driving');
});

it('leaves อนุมัติไปราชการ out of the section bar for someone who approves no trips', async () => {
  mocks.headers.mockResolvedValue(new Headers());
  mocks.readSession.mockResolvedValue(session([]));
  mocks.database.mockReturnValue({ query: vi.fn(async (sql: string) => sql.includes('AS allowed') ? [{ allowed: 0 }] : []) });
  render(await ModuleLayout({ code: 'official-travel', children: <p>เนื้อหา</p> }));
  // Only ไปราชการของฉัน is left (the request form opens from the top button), so no section bar is drawn.
  expect(screen.getByText('เนื้อหา')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'อนุมัติไปราชการ' })).toBeNull();
});
